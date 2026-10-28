"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { lerValor } from "@/componentes/Catalogo";
import { supabase } from "@/lib/supabase";

type Cliente = { id: string; nome: string };
type Pessoa = { id: string; nome: string; papel: string; tecnico_responsavel_id: string | null };
type OS = { id: string; tecnico_id: string | null; os_clientes: { cliente_id: string }[] };
type Lanc = { os_id: string; quantidade: number; valor_unitario: number | null; item: { nome: string; cliente_id: string | null } | null };
type Alocacao = { cliente_id: string; tecnico_id: string; percentual: number };
type Custo = { id: string; tecnico_id: string | null; categoria: Categoria; valor: number };
type Categoria = "folha" | "ferramental" | "frota" | "outros";

const CATEGORIAS: { chave: Categoria; rotulo: string; auto: string }[] = [
  { chave: "folha", rotulo: "Folha de pagamento", auto: "" },
  { chave: "ferramental", rotulo: "Ferramental", auto: "despesas de ferramenta e material" },
  { chave: "frota", rotulo: "Frota", auto: "combustível, pedágio, estacionamento e manutenção do veículo" },
  { chave: "outros", rotulo: "Outros", auto: "alimentação, hospedagem e outras despesas" },
];
// Despesa aprovada lançada pelo técnico no app → categoria de custo.
const DESPESA_PARA: Record<string, Categoria> = {
  ferramenta: "ferramental", material: "ferramental",
  combustivel: "frota", pedagio: "frota", estacionamento: "frota", manutencao_veiculo: "frota",
  alimentacao: "outros", hospedagem: "outros", outros: "outros",
};

const real = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const paraCampo = (n: number | null | undefined) => (n != null ? String(n).replace(".", ",") : "");

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Centro de custo por contrato (cliente), mês a mês:
// receita do contrato − custos das equipes alocadas nele (folha, ferramental, frota, outros) − rateio dos custos gerais
// = lucro do contrato, e quanto cada equipe representa dentro dele e no total.
// Equipe = técnico + auxiliares dele. Custos de equipe em mais de um contrato são divididos pelo percentual de alocação.
// Receita do contrato com LPU (casa do cliente): a soma dos serviços executados, se o faturamento não for digitado.
export default function Producao() {
  const [mes, setMes] = useState(mesAtual());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [lpuClientes, setLpuClientes] = useState<Set<string>>(new Set());
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [fat, setFat] = useState<{ cliente_id: string; valor: number }[]>([]);
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [custos, setCustos] = useState<Custo[]>([]);
  const [auto, setAuto] = useState<{ tecnico_id: string | null; categoria: Categoria; valor: number }[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => setClientes(data ?? []));
    supabase.from("usuarios").select("id, nome, papel, tecnico_responsavel_id").eq("ativo", true).is("excluido_em", null).order("nome")
      .then(({ data }) => setPessoas(data ?? []));
    supabase.from("itens_execucao").select("cliente_id").not("cliente_id", "is", null)
      .then(({ data }) => setLpuClientes(new Set((data ?? []).map((x) => x.cliente_id as string))));
  }, []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(a, m - 1, 1).toISOString();
    const fim = new Date(a, m, 1).toISOString();
    const diaIni = `${mes}-01`;
    const diaFim = `${a + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    (async () => {
      const { data: os } = await supabase.from("ordens_servico").select("id, tecnico_id, os_clientes(cliente_id)")
        .in("status", ["concluida", "baixada"]).gte("concluida_em", ini).lt("concluida_em", fim);
      const lista = (os as unknown as OS[]) ?? [];
      const ids = lista.map((o) => o.id);
      const [l, f, al, cu, de, vm] = await Promise.all([
        ids.length
          ? supabase.from("os_servicos_executados").select("os_id, quantidade, valor_unitario, item:itens_execucao(nome, cliente_id)").in("os_id", ids)
          : Promise.resolve({ data: [] }),
        supabase.from("faturamento_clientes").select("cliente_id, valor").eq("mes", diaIni),
        supabase.from("contrato_equipes").select("cliente_id, tecnico_id, percentual"),
        supabase.from("custos_mensais").select("id, tecnico_id, categoria, valor").eq("mes", diaIni),
        supabase.from("despesas").select("tecnico_id, categoria, valor").eq("status", "aprovada").gte("data", diaIni).lt("data", diaFim),
        supabase.from("veiculo_manutencoes").select("valor, veiculo:veiculos(tecnico_id)").gte("data", diaIni).lt("data", diaFim),
      ]);
      if (!ativo) return;
      setOrdens(lista);
      setLancs(((l.data as unknown as Lanc[]) ?? []).filter((x) => x.item?.cliente_id));
      setFat(f.data ?? []);
      setAlocacoes(al.data ?? []);
      setCustos((cu.data as Custo[]) ?? []);
      setAuto([
        ...((de.data ?? []) as { tecnico_id: string; categoria: string; valor: number }[])
          .map((d) => ({ tecnico_id: d.tecnico_id, categoria: DESPESA_PARA[d.categoria] ?? "outros", valor: Number(d.valor) })),
        ...((vm.data ?? []) as unknown as { valor: number | null; veiculo: { tecnico_id: string | null } | null }[])
          .map((v) => ({ tecnico_id: v.veiculo?.tecnico_id ?? null, categoria: "frota" as Categoria, valor: Number(v.valor ?? 0) })),
      ]);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [mes, versao]);

  // Equipe de cada pessoa: o auxiliar entra na equipe do técnico responsável por ele.
  const equipeDe = useCallback((id: string | null) => {
    if (!id) return null;
    return pessoas.find((p) => p.id === id)?.tecnico_responsavel_id ?? id;
  }, [pessoas]);
  const equipes = useMemo(() => pessoas.filter((p) => p.papel === "tecnico" && !p.tecnico_responsavel_id), [pessoas]);
  const nomeEquipe = useCallback((id: string) => {
    const aux = pessoas.filter((p) => p.tecnico_responsavel_id === id).map((p) => p.nome.split(" ")[0]);
    const nome = pessoas.find((p) => p.id === id)?.nome ?? "Equipe";
    return aux.length ? `${nome} + ${aux.join(", ")}` : nome;
  }, [pessoas]);

  async function salvarFat(clienteId: string, texto: string) {
    const valor = lerValor(texto);
    if (valor === (fat.find((f) => f.cliente_id === clienteId)?.valor ?? null)) return;
    const { error } = valor == null
      ? await supabase.from("faturamento_clientes").delete().eq("mes", `${mes}-01`).eq("cliente_id", clienteId)
      : await supabase.from("faturamento_clientes").upsert({ mes: `${mes}-01`, cliente_id: clienteId, valor, atualizado_em: new Date().toISOString() });
    if (error) alert(error.message);
    recarregar();
  }

  async function salvarCusto(tecnicoId: string | null, categoria: Categoria, texto: string) {
    const valor = lerValor(texto);
    const atual = custos.find((c) => c.tecnico_id === tecnicoId && c.categoria === categoria);
    if (valor === (atual?.valor ?? null)) return;
    const { error } = atual
      ? valor == null
        ? await supabase.from("custos_mensais").delete().eq("id", atual.id)
        : await supabase.from("custos_mensais").update({ valor, atualizado_em: new Date().toISOString() }).eq("id", atual.id)
      : valor == null ? { error: null } : await supabase.from("custos_mensais").insert({ mes: `${mes}-01`, tecnico_id: tecnicoId, categoria, valor });
    if (error) alert(error.message);
    recarregar();
  }

  async function alocar(clienteId: string, tecnicoId: string) {
    if (!tecnicoId) return;
    const { error } = await supabase.from("contrato_equipes").insert({ cliente_id: clienteId, tecnico_id: tecnicoId, percentual: 100 });
    if (error) alert(error.message);
    recarregar();
  }
  async function mudarPercentual(a: Alocacao, texto: string) {
    const p = lerValor(texto);
    if (p == null || p === a.percentual) return;
    if (!(p > 0 && p <= 100)) return alert("Use um percentual de 1 a 100.");
    const { error } = await supabase.from("contrato_equipes").update({ percentual: p }).eq("cliente_id", a.cliente_id).eq("tecnico_id", a.tecnico_id);
    if (error) alert(error.message);
    recarregar();
  }
  async function desalocar(a: Alocacao) {
    if (!confirm(`Tirar ${nomeEquipe(a.tecnico_id)} deste contrato?`)) return;
    const { error } = await supabase.from("contrato_equipes").delete().eq("cliente_id", a.cliente_id).eq("tecnico_id", a.tecnico_id);
    if (error) alert(error.message);
    recarregar();
  }

  const r = useMemo(() => {
    // Custos do mês por equipe e por categoria (digitado + automático).
    const custoEquipe = new Map<string, Record<Categoria, { digitado: number; auto: number }>>();
    const vazio = () => ({ folha: { digitado: 0, auto: 0 }, ferramental: { digitado: 0, auto: 0 }, frota: { digitado: 0, auto: 0 }, outros: { digitado: 0, auto: 0 } });
    const daEquipe = (id: string) => { if (!custoEquipe.has(id)) custoEquipe.set(id, vazio()); return custoEquipe.get(id)!; };
    const gerais = vazio();
    for (const c of custos) (c.tecnico_id ? daEquipe(equipeDe(c.tecnico_id)!) : gerais)[c.categoria].digitado += Number(c.valor);
    for (const c of auto) (c.tecnico_id ? daEquipe(equipeDe(c.tecnico_id)!) : gerais)[c.categoria].auto += c.valor;
    const somaCat = (x: Record<Categoria, { digitado: number; auto: number }>) => CATEGORIAS.reduce((t, k) => t + x[k.chave].digitado + x[k.chave].auto, 0);

    // Produção LPU por contrato e por equipe.
    const osPorId = new Map(ordens.map((o) => [o.id, o]));
    const lpu = new Map<string, Map<string, number>>();
    const porServico = new Map<string, { qtd: number; valor: number }>();
    for (const l of lancs) {
      const cid = l.item!.cliente_id!;
      const eq = equipeDe(osPorId.get(l.os_id)?.tecnico_id ?? null) ?? "-";
      const v = (l.valor_unitario ?? 0) * l.quantidade;
      if (!lpu.has(cid)) lpu.set(cid, new Map());
      lpu.get(cid)!.set(eq, (lpu.get(cid)!.get(eq) ?? 0) + v);
      const s = porServico.get(l.item!.nome) ?? { qtd: 0, valor: 0 };
      porServico.set(l.item!.nome, { qtd: s.qtd + l.quantidade, valor: s.valor + v });
    }

    // Peso de cada contrato no custo de cada equipe.
    const somaPct = new Map<string, number>();
    for (const a of alocacoes) somaPct.set(a.tecnico_id, (somaPct.get(a.tecnico_id) ?? 0) + Number(a.percentual));

    const contratos = clientes.map((c) => {
      const prodLpu = [...(lpu.get(c.id)?.values() ?? [])].reduce((t, v) => t + v, 0);
      const digitado = fat.find((f) => f.cliente_id === c.id)?.valor ?? null;
      const receita = digitado ?? (lpuClientes.has(c.id) ? prodLpu : 0);
      const alocs = alocacoes.filter((a) => a.cliente_id === c.id);
      const os = ordens.filter((o) => o.os_clientes.some((x) => x.cliente_id === c.id)).length;
      return { cliente: c, receita, digitado, prodLpu, alocs, os };
    });
    const receitaTotal = contratos.reduce((t, c) => t + c.receita, 0);

    // Custo de equipe sem contrato também vai para o rateio geral (aviso na tela).
    const semContrato = [...custoEquipe.keys()].filter((id) => !somaPct.get(id));
    const geralTotal = somaCat(gerais) + semContrato.reduce((t, id) => t + somaCat(custoEquipe.get(id)!), 0);

    type Parte = { equipe: string; receita: number; custo: number };
    const resultado = contratos.map((c) => {
      const rateio = receitaTotal ? geralTotal * (c.receita / receitaTotal) : 0;
      const pesoAloc = c.alocs.reduce((t, a) => t + Number(a.percentual), 0);
      const prodPorEquipe = lpu.get(c.cliente.id);
      const partes: Parte[] = c.alocs.map((a) => {
        const custo = custoEquipe.has(a.tecnico_id) ? somaCat(custoEquipe.get(a.tecnico_id)!) * (Number(a.percentual) / somaPct.get(a.tecnico_id)!) : 0;
        // Receita da equipe no contrato: pela produção LPU dela, se houver; senão pelo percentual de alocação.
        const peso = c.prodLpu > 0 ? (prodPorEquipe?.get(a.tecnico_id) ?? 0) / c.prodLpu : pesoAloc ? Number(a.percentual) / pesoAloc : 0;
        return { equipe: a.tecnico_id, receita: c.receita * peso, custo: custo + rateio * (pesoAloc ? Number(a.percentual) / pesoAloc : 0) };
      });
      const custo = partes.reduce((t, p) => t + p.custo, 0) + (c.alocs.length ? 0 : rateio);
      return { ...c, rateio, partes, custo, lucro: c.receita - custo };
    });

    const porEquipe = new Map<string, { receita: number; custo: number }>();
    for (const c of resultado) for (const p of c.partes) {
      const e = porEquipe.get(p.equipe) ?? { receita: 0, custo: 0 };
      porEquipe.set(p.equipe, { receita: e.receita + p.receita, custo: e.custo + p.custo });
    }
    const custoTotal = resultado.reduce((t, c) => t + c.custo, 0);
    return {
      custoEquipe, gerais, somaCat, resultado, receitaTotal, custoTotal, lucroTotal: receitaTotal - custoTotal, semContrato,
      porEquipe: [...porEquipe.entries()].map(([id, v]) => ({ id, ...v, lucro: v.receita - v.custo })).sort((a, b) => b.lucro - a.lucro),
      porServico: [...porServico.entries()].sort((a, b) => b[1].valor - a[1].valor),
    };
  }, [custos, auto, ordens, lancs, alocacoes, clientes, fat, lpuClientes, equipeDe]);

  const card = "rounded-xl border border-gray-200 bg-white p-4";
  const th = "py-1.5 text-xs font-medium text-gray-500";
  const entrada = "w-28 rounded border border-gray-300 px-2 py-1 text-right tabular-nums";
  const margem = (lucro: number, receita: number) => (receita ? pct(lucro / receita) : "—");

  return (
    <div className="space-y-4">
      <section className={`${card} flex flex-wrap items-end gap-6`}>
        <label className="flex flex-col text-xs text-gray-600">Mês
          <input type="month" className="rounded-lg border border-gray-300 p-2 text-sm" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <div><p className="text-xs text-gray-500">Receita</p><p className="text-xl font-semibold">{real(r.receitaTotal)}</p></div>
        <div><p className="text-xs text-gray-500">Custos</p><p className="text-xl font-semibold">{real(r.custoTotal)}</p></div>
        <div><p className="text-xs text-gray-500">Lucro</p><p className={`text-2xl font-bold ${r.lucroTotal < 0 ? "text-red-700" : "text-green-700"}`}>{real(r.lucroTotal)}</p></div>
        <div><p className="text-xs text-gray-500">Margem</p><p className="text-xl font-semibold">{margem(r.lucroTotal, r.receitaTotal)}</p></div>
        {carregando && <span className="text-sm text-gray-500">Carregando…</span>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Contratos (centro de custo)</h2>
        <p className="text-xs text-gray-500">Digite a receita do mês de cada contrato e aloque as equipes que atuam nele. O percentual divide o custo da equipe quando ela atende mais de um contrato. Clique no contrato para ver cada equipe.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-gray-200 text-left">
              <th className={th}>Contrato</th><th className={`${th} text-right`}>Receita (R$)</th><th className={`${th} pl-4`}>Equipes alocadas (% do custo)</th>
              <th className={`${th} text-right`}>Custo</th><th className={`${th} text-right`}>Lucro</th><th className={`${th} text-right`}>Margem</th>
            </tr></thead>
            <tbody>
              {r.resultado.map((c) => (
                <Fragment key={c.cliente.id}>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2">
                      <button className="text-left font-medium hover:underline" onClick={() => setAberto(aberto === c.cliente.id ? null : c.cliente.id)}>
                        {aberto === c.cliente.id ? "▾" : "▸"} {c.cliente.nome}
                      </button>
                      <div className="text-xs text-gray-500">{c.os} O.S. concluída(s)</div>
                    </td>
                    <td className="py-2 text-right">
                      <input aria-label={`Receita ${c.cliente.nome}`} inputMode="decimal" className={entrada}
                        placeholder={lpuClientes.has(c.cliente.id) ? paraCampo(Number(c.prodLpu.toFixed(2))) : "0,00"}
                        key={`${mes}-${c.cliente.id}-${c.digitado}`} defaultValue={paraCampo(c.digitado)} onBlur={(e) => salvarFat(c.cliente.id, e.target.value)} />
                      {lpuClientes.has(c.cliente.id) && c.digitado == null && <div className="text-xs text-gray-500">usando produção LPU</div>}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.alocs.map((a) => (
                          <span key={a.tecnico_id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1.5 text-xs">
                            {nomeEquipe(a.tecnico_id)}
                            <input aria-label="Percentual da equipe neste contrato" className="w-10 rounded border border-gray-200 px-1 text-right" inputMode="decimal"
                              key={`${a.tecnico_id}-${a.percentual}`} defaultValue={paraCampo(Number(a.percentual))} onBlur={(e) => mudarPercentual(a, e.target.value)} />%
                            <button className="text-gray-500 hover:text-red-700" title="Tirar do contrato" onClick={() => desalocar(a)}>×</button>
                          </span>
                        ))}
                        <select aria-label="Alocar equipe" className="rounded border border-gray-300 p-1 text-xs" value="" onChange={(e) => alocar(c.cliente.id, e.target.value)}>
                          <option value="">+ equipe</option>
                          {equipes.filter((e) => !c.alocs.some((a) => a.tecnico_id === e.id)).map((e) => <option key={e.id} value={e.id}>{nomeEquipe(e.id)}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{real(c.custo)}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${c.lucro < 0 ? "text-red-700" : ""}`}>{real(c.lucro)}</td>
                    <td className="py-2 text-right tabular-nums">{margem(c.lucro, c.receita)}</td>
                  </tr>
                  {aberto === c.cliente.id && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-4 py-2">
                        {c.partes.length === 0 ? <p className="text-sm text-gray-500">Nenhuma equipe alocada. O contrato recebe só o rateio dos custos gerais ({real(c.rateio)}).</p> : (
                          <table className="w-full text-sm">
                            <thead><tr className="text-left"><th className={th}>Equipe</th><th className={`${th} text-right`}>Receita</th><th className={`${th} text-right`}>Custo</th><th className={`${th} text-right`}>Lucro</th><th className={`${th} pl-4`}>% do contrato (receita)</th></tr></thead>
                            <tbody>
                              {c.partes.map((p) => (
                                <tr key={p.equipe}>
                                  <td className="py-1">{nomeEquipe(p.equipe)}</td>
                                  <td className="py-1 text-right tabular-nums">{real(p.receita)}</td>
                                  <td className="py-1 text-right tabular-nums">{real(p.custo)}</td>
                                  <td className={`py-1 text-right tabular-nums ${p.receita - p.custo < 0 ? "text-red-700" : ""}`}>{real(p.receita - p.custo)}</td>
                                  <td className="py-1 pl-4"><Barra valor={c.receita ? p.receita / c.receita : 0} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {c.rateio > 0 && c.partes.length > 0 && <p className="mt-1 text-xs text-gray-500">Inclui {real(c.rateio)} de rateio dos custos gerais.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Custos do mês</h2>
        <p className="text-xs text-gray-500">
          Digite a folha e o que não passa pelo app. Já somados sozinhos: despesas aprovadas dos técnicos e auxiliares e manutenção dos veículos de cada equipe (número cinza abaixo do campo).
          A linha <b>Custos gerais</b> é dividida entre os contratos pela receita.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead><tr className="border-b border-gray-200 text-left">
              <th className={th}>Equipe</th>
              {CATEGORIAS.map((k) => <th key={k.chave} className={`${th} text-right`} title={k.auto}>{k.rotulo}</th>)}
              <th className={`${th} text-right`}>Total</th>
            </tr></thead>
            <tbody>
              {[...equipes.map((e) => ({ id: e.id as string | null, nome: nomeEquipe(e.id) })), { id: null, nome: "Custos gerais (rateio)" }].map((e) => {
                const linha = e.id ? r.custoEquipe.get(e.id) : r.gerais;
                return (
                  <tr key={e.id ?? "gerais"} className="border-b border-gray-100 align-top last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{e.nome}</span>
                      {e.id && r.semContrato.includes(e.id) && <div className="text-xs text-amber-700">sem contrato: entra no rateio geral</div>}
                    </td>
                    {CATEGORIAS.map((k) => {
                      const digitado = custos.find((c) => c.tecnico_id === e.id && c.categoria === k.chave)?.valor ?? null;
                      const automatico = linha?.[k.chave].auto ?? 0;
                      return (
                        <td key={k.chave} className="py-2 text-right">
                          <input aria-label={`${k.rotulo} ${e.nome}`} inputMode="decimal" className={entrada} placeholder="0,00"
                            key={`${mes}-${e.id}-${k.chave}-${digitado}`} defaultValue={paraCampo(digitado)}
                            onBlur={(ev) => salvarCusto(e.id, k.chave, ev.target.value)} />
                          {automatico > 0 && <div className="text-xs text-gray-500">+ {real(automatico)} do app</div>}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right font-semibold tabular-nums">{real(linha ? r.somaCat(linha) : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Resultado por equipe</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left">
              <th className={th}>Equipe</th><th className={`${th} text-right`}>Receita</th><th className={`${th} text-right`}>Custo</th><th className={`${th} text-right`}>Lucro</th><th className={`${th} pl-4`}>% do lucro total</th>
            </tr></thead>
            <tbody>
              {r.porEquipe.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">Aloque as equipes nos contratos para ver o resultado.</td></tr>}
              {r.porEquipe.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 font-medium">{nomeEquipe(e.id)}</td>
                  <td className="py-1.5 text-right tabular-nums">{real(e.receita)}</td>
                  <td className="py-1.5 text-right tabular-nums">{real(e.custo)}</td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${e.lucro < 0 ? "text-red-700" : ""}`}>{real(e.lucro)}</td>
                  <td className="py-1.5 pl-4">{r.lucroTotal > 0 ? <Barra valor={e.lucro / r.lucroTotal} /> : <span className="text-xs text-gray-500">sem lucro no mês</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Produção LPU (casa do cliente)</h2>
          <p className="text-xs text-gray-500">Serviços lançados nas O.S. concluídas no mês.</p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left"><th className={th}>Serviço</th><th className={`${th} text-right`}>Qtd</th><th className={`${th} text-right`}>Valor</th></tr></thead>
            <tbody>
              {r.porServico.length === 0 && <tr><td colSpan={3} className="py-3 text-gray-500">Nenhum serviço de LPU neste mês.</td></tr>}
              {r.porServico.map(([nome, v]) => (
                <tr key={nome} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5">{nome}</td><td className="py-1.5 text-right tabular-nums">{v.qtd.toLocaleString("pt-BR")}</td><td className="py-1.5 text-right tabular-nums">{real(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Barra({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 rounded bg-gray-100"><div className="h-2 rounded bg-blue-700" style={{ width: `${Math.max(0, Math.min(100, valor * 100))}%` }} /></div>
      <span className="tabular-nums">{pct(valor)}</span>
    </div>
  );
}
