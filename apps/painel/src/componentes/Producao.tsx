"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { lerValor } from "@/componentes/Catalogo";
import { supabase } from "@/lib/supabase";

type Cliente = { id: string; nome: string };
type OS = { id: string; numero: number | null; tecnico_id: string | null; tecnico: { nome: string } | null; os_clientes: { cliente_id: string }[] };
type Lanc = { os_id: string; quantidade: number; valor_unitario: number | null; item: { nome: string; cliente_id: string | null } | null };
type Fat = { cliente_id: string; valor: number };

const real = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Produção do mês: o que o técnico executou na LPU dos clientes "casa do cliente" (Master-C.C), somado ao
// faturamento dos demais clientes, e quanto cada técnico representa do total.
// Nos demais clientes, a parte de cada técnico é proporcional às O.S. do cliente que ele concluiu no mês.
export default function Producao() {
  const [mes, setMes] = useState(mesAtual());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [lpuClientes, setLpuClientes] = useState<Set<string>>(new Set());
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [fat, setFat] = useState<Fat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => setClientes(data ?? []));
    supabase.from("itens_execucao").select("cliente_id").not("cliente_id", "is", null)
      .then(({ data }) => setLpuClientes(new Set((data ?? []).map((x) => x.cliente_id as string))));
  }, []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(a, m - 1, 1).toISOString();
    const fim = new Date(a, m, 1).toISOString();
    (async () => {
      const { data: os } = await supabase.from("ordens_servico")
        .select("id, numero, tecnico_id, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome), os_clientes(cliente_id)")
        .in("status", ["concluida", "baixada"]).gte("concluida_em", ini).lt("concluida_em", fim);
      const lista = (os as unknown as OS[]) ?? [];
      const ids = lista.map((o) => o.id);
      const [{ data: l }, { data: f }] = await Promise.all([
        ids.length
          ? supabase.from("os_servicos_executados").select("os_id, quantidade, valor_unitario, item:itens_execucao(nome, cliente_id)").in("os_id", ids)
          : Promise.resolve({ data: [] }),
        supabase.from("faturamento_clientes").select("cliente_id, valor").eq("mes", `${mes}-01`),
      ]);
      if (!ativo) return;
      setOrdens(lista);
      setLancs(((l as unknown as Lanc[]) ?? []).filter((x) => x.item?.cliente_id));
      setFat(f ?? []);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [mes, versao]);

  async function salvarFat(clienteId: string, texto: string) {
    const valor = lerValor(texto);
    const atual = fat.find((f) => f.cliente_id === clienteId)?.valor ?? null;
    if (valor === atual) return;
    const { error } = valor == null
      ? await supabase.from("faturamento_clientes").delete().eq("mes", `${mes}-01`).eq("cliente_id", clienteId)
      : await supabase.from("faturamento_clientes").upsert({ mes: `${mes}-01`, cliente_id: clienteId, valor, atualizado_em: new Date().toISOString() });
    if (error) alert(error.message);
    recarregar();
  }

  const calculo = useMemo(() => {
    const osPorId = new Map(ordens.map((o) => [o.id, o]));
    const nomeTec = (id: string | null) => (id ? ordens.find((o) => o.tecnico_id === id)?.tecnico?.nome ?? "Técnico" : "Sem técnico");
    type Linha = { id: string; nome: string; lpu: number; demais: number; servicos: number };
    const tec = new Map<string, Linha>();
    const linha = (id: string | null) => {
      const chave = id ?? "-";
      if (!tec.has(chave)) tec.set(chave, { id: chave, nome: nomeTec(id), lpu: 0, demais: 0, servicos: 0 });
      return tec.get(chave)!;
    };

    // LPU (casa do cliente): soma valor × quantidade, para o técnico responsável pela O.S.
    const porServico = new Map<string, { qtd: number; valor: number }>();
    for (const l of lancs) {
      const o = osPorId.get(l.os_id);
      const v = (l.valor_unitario ?? 0) * l.quantidade;
      const t = linha(o?.tecnico_id ?? null);
      t.lpu += v;
      t.servicos += l.quantidade;
      const nome = l.item?.nome ?? "Serviço";
      const s = porServico.get(nome) ?? { qtd: 0, valor: 0 };
      porServico.set(nome, { qtd: s.qtd + l.quantidade, valor: s.valor + v });
    }
    const totalLpu = lancs.reduce((t, l) => t + (l.valor_unitario ?? 0) * l.quantidade, 0);

    // Demais clientes: faturamento digitado, dividido pelas O.S. concluídas de cada técnico naquele cliente.
    const porCliente = clientes.filter((c) => !lpuClientes.has(c.id)).map((c) => {
      const doCliente = ordens.filter((o) => o.os_clientes.some((x) => x.cliente_id === c.id));
      const valor = fat.find((f) => f.cliente_id === c.id)?.valor ?? null;
      return { cliente: c, os: doCliente, valor };
    });
    let semOs = 0;
    for (const pc of porCliente) {
      if (!pc.valor) continue;
      if (!pc.os.length) { semOs += pc.valor; continue; }
      for (const o of pc.os) linha(o.tecnico_id).demais += pc.valor / pc.os.length;
    }
    const totalDemais = porCliente.reduce((t, pc) => t + (pc.valor ?? 0), 0);
    const total = totalLpu + totalDemais;
    const tecnicos = [...tec.values()].sort((a, b) => b.lpu + b.demais - (a.lpu + a.demais));
    const lpuPorCliente = clientes.filter((c) => lpuClientes.has(c.id)).map((c) => ({
      cliente: c,
      os: ordens.filter((o) => o.os_clientes.some((x) => x.cliente_id === c.id)).length,
      valor: lancs.filter((l) => l.item?.cliente_id === c.id).reduce((t, l) => t + (l.valor_unitario ?? 0) * l.quantidade, 0),
    }));
    return { tecnicos, porServico: [...porServico.entries()].sort((a, b) => b[1].valor - a[1].valor), totalLpu, porCliente, totalDemais, total, semOs, lpuPorCliente };
  }, [ordens, lancs, fat, clientes, lpuClientes]);

  const semValor = lancs.filter((l) => l.valor_unitario == null).length;
  const card = "rounded-xl border border-gray-200 bg-white p-4";

  return (
    <div className="space-y-4">
      <section className={`${card} flex flex-wrap items-end gap-4`}>
        <label className="flex flex-col text-xs text-gray-600">Mês
          <input type="month" className="rounded-lg border border-gray-300 p-2 text-sm" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <div><p className="text-xs text-gray-500">Faturamento total</p><p className="text-2xl font-bold">{real(calculo.total)}</p></div>
        <div><p className="text-xs text-gray-500">Produção LPU (casa do cliente)</p><p className="text-xl font-semibold">{real(calculo.totalLpu)}</p></div>
        <div><p className="text-xs text-gray-500">Demais clientes</p><p className="text-xl font-semibold">{real(calculo.totalDemais)}</p></div>
        {carregando && <span className="text-sm text-gray-500">Carregando…</span>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Quanto cada técnico representa do faturamento</h2>
        <p className="text-xs text-gray-500">LPU: valor dos serviços que o técnico lançou nas O.S. dele. Demais clientes: faturamento do cliente dividido pelas O.S. concluídas no mês (O.S. com mais de um cliente conta para cada um).</p>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-1.5">Técnico</th><th className="py-1.5 text-right">LPU casa do cliente</th><th className="py-1.5 text-right">Demais clientes</th><th className="py-1.5 text-right">Total</th><th className="py-1.5 pl-4">% do faturamento</th>
          </tr></thead>
          <tbody>
            {calculo.tecnicos.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">Nada concluído neste mês.</td></tr>}
            {calculo.tecnicos.map((t) => {
              const tot = t.lpu + t.demais;
              const p = calculo.total ? tot / calculo.total : 0;
              return (
                <tr key={t.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 font-medium">{t.nome}</td>
                  <td className="py-1.5 text-right tabular-nums">{real(t.lpu)}</td>
                  <td className="py-1.5 text-right tabular-nums">{real(t.demais)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{real(tot)}</td>
                  <td className="py-1.5 pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded bg-gray-100"><div className="h-2 rounded bg-blue-700" style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
                      <span className="tabular-nums">{pct(p)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {calculo.semOs > 0 && (
              <tr><td className="py-1.5 text-gray-500">Sem O.S. no mês (não atribuído)</td><td /><td className="py-1.5 text-right tabular-nums text-gray-500">{real(calculo.semOs)}</td><td className="py-1.5 text-right tabular-nums text-gray-500">{real(calculo.semOs)}</td><td className="py-1.5 pl-4 text-gray-500">{pct(calculo.total ? calculo.semOs / calculo.total : 0)}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Produção Master casa cliente (LPU)</h2>
          {calculo.lpuPorCliente.map((c) => (
            <p key={c.cliente.id} className="text-sm text-gray-600">{c.cliente.nome}: {c.os} O.S. concluída(s) · <b>{real(c.valor)}</b></p>
          ))}
          {semValor > 0 && <p className="mt-1 text-xs text-amber-700">{semValor} lançamento(s) sem valor. Ajuste na O.S. para entrar na soma.</p>}
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500"><th className="py-1.5">Serviço</th><th className="py-1.5 text-right">Qtd</th><th className="py-1.5 text-right">Valor</th></tr></thead>
            <tbody>
              {calculo.porServico.length === 0 && <tr><td colSpan={3} className="py-3 text-gray-500">Nenhum serviço de LPU em O.S. concluída neste mês.</td></tr>}
              {calculo.porServico.map(([nome, v]) => (
                <tr key={nome} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5">{nome}</td><td className="py-1.5 text-right tabular-nums">{v.qtd.toLocaleString("pt-BR")}</td><td className="py-1.5 text-right tabular-nums">{real(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Faturamento dos demais clientes</h2>
          <p className="text-xs text-gray-500">Digite o valor cobrado de cada cliente no mês. Salva ao sair do campo.</p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500"><th className="py-1.5">Cliente</th><th className="py-1.5 text-right">O.S. concluídas</th><th className="py-1.5 text-right">Faturado (R$)</th></tr></thead>
            <tbody>
              {calculo.porCliente.map((pc) => (
                <tr key={pc.cliente.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5">{pc.cliente.nome}</td>
                  <td className="py-1.5 text-right tabular-nums">{pc.os.length}</td>
                  <td className="py-1.5 text-right">
                    <input aria-label={`Faturamento ${pc.cliente.nome}`} inputMode="decimal" placeholder="0,00"
                      key={`${mes}-${pc.cliente.id}-${pc.valor}`} defaultValue={pc.valor != null ? String(pc.valor).replace(".", ",") : ""}
                      onBlur={(e) => salvarFat(pc.cliente.id, e.target.value)}
                      className="w-32 rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
