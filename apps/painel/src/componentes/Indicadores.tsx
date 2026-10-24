"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type OS = {
  id: string; tipo: string; status: string; criado_em: string; iniciada_em: string | null; concluida_em: string | null;
  sla_limite: string | null; tecnico: { nome: string } | null;
};
type Consumo = { quantidade: number; item: { nome: string; unidade: string } | null };

const FINALIZADAS = ["concluida", "baixada"];
const horas = (de: string, ate: string) => (new Date(ate).getTime() - new Date(de).getTime()) / 3600000;
const fmtH = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const fmt = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

// Indicadores do período: volume, SLA, tempos, produção por técnico, por tipo e consumo de material.
export default function Indicadores() {
  const [dias, setDias] = useState(30);
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [consumo, setConsumo] = useState<Consumo[]>([]);
  const [caixas, setCaixas] = useState(0);

  useEffect(() => {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    supabase.from("ordens_servico")
      .select("id, tipo, status, criado_em, iniciada_em, concluida_em, sla_limite, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome)")
      .gte("criado_em", desde).neq("status", "cancelada").limit(5000)
      .then(({ data }) => setOrdens((data as unknown as OS[]) ?? []));
    supabase.from("estoque_movimentos").select("quantidade, item:itens_execucao(nome, unidade)").eq("tipo", "consumo").gte("criado_em", desde)
      .then(({ data }) => setConsumo((data as unknown as Consumo[]) ?? []));
    supabase.from("caixas_emenda").select("id", { count: "exact", head: true }).gte("criado_em", desde)
      .then(({ count }) => setCaixas(count ?? 0));
  }, [dias]);

  const r = useMemo(() => {
    const finalizadas = ordens.filter((o) => FINALIZADAS.includes(o.status) && o.concluida_em);
    const comSla = finalizadas.filter((o) => o.sla_limite);
    const noPrazo = comSla.filter((o) => new Date(o.concluida_em!) <= new Date(o.sla_limite!));
    const resposta = ordens.filter((o) => o.iniciada_em).map((o) => horas(o.criado_em, o.iniciada_em!));
    const execucao = finalizadas.filter((o) => o.iniciada_em).map((o) => horas(o.iniciada_em!, o.concluida_em!));

    const porTecnico = new Map<string, { total: number; finalizadas: number; noPrazo: number; comSla: number; exec: number[] }>();
    for (const o of ordens) {
      const nome = o.tecnico?.nome ?? "Sem técnico";
      if (!porTecnico.has(nome)) porTecnico.set(nome, { total: 0, finalizadas: 0, noPrazo: 0, comSla: 0, exec: [] });
      const t = porTecnico.get(nome)!;
      t.total++;
      if (FINALIZADAS.includes(o.status) && o.concluida_em) {
        t.finalizadas++;
        if (o.sla_limite) { t.comSla++; if (new Date(o.concluida_em) <= new Date(o.sla_limite)) t.noPrazo++; }
        if (o.iniciada_em) t.exec.push(horas(o.iniciada_em, o.concluida_em));
      }
    }
    const porTipo = new Map<string, number>();
    for (const o of ordens) porTipo.set(o.tipo, (porTipo.get(o.tipo) ?? 0) + 1);
    const materiais = new Map<string, { qtd: number; unidade: string }>();
    for (const c of consumo) {
      if (!c.item) continue;
      const m = materiais.get(c.item.nome) ?? { qtd: 0, unidade: c.item.unidade };
      m.qtd += Number(c.quantidade);
      materiais.set(c.item.nome, m);
    }
    return {
      total: ordens.length,
      finalizadas: finalizadas.length,
      abertas: ordens.length - finalizadas.length,
      sla: comSla.length ? Math.round((noPrazo.length / comSla.length) * 100) : null,
      resposta: media(resposta),
      execucao: media(execucao),
      porTecnico: [...porTecnico.entries()].sort((a, b) => b[1].total - a[1].total),
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
      materiais: [...materiais.entries()].sort((a, b) => b[1].qtd - a[1].qtd),
    };
  }, [ordens, consumo]);

  const cartao = (rotulo: string, valor: string, detalhe?: string, cor = "") => (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{rotulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${cor}`}>{valor}</div>
      {detalhe && <div className="text-xs text-gray-500">{detalhe}</div>}
    </div>
  );
  const maxTipo = Math.max(1, ...r.porTipo.map(([, n]) => n));

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Indicadores</h2>
        <select className="ml-auto rounded-lg border border-gray-300 p-2 text-sm" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Últimos 12 meses</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cartao("O.S. no período", String(r.total))}
        {cartao("Concluídas", String(r.finalizadas), `${r.abertas} em aberto`)}
        {cartao("SLA cumprido", r.sla == null ? "—" : `${r.sla}%`, "conclusão até 4h do cadastro",
          r.sla == null ? "" : r.sla >= 90 ? "text-green-700" : r.sla >= 70 ? "text-amber-600" : "text-red-700")}
        {cartao("Tempo até iniciar", fmtH(r.resposta), "do cadastro ao início em campo")}
        {cartao("Tempo em campo", fmtH(r.execucao), "do início à conclusão")}
        {cartao("Caixas cadastradas", String(caixas))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-200 p-4 font-semibold">Por técnico</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="p-3">Técnico</th><th className="p-3 text-right">O.S.</th><th className="p-3 text-right">Concluídas</th><th className="p-3 text-right">SLA</th><th className="p-3 text-right">Tempo médio</th></tr>
            </thead>
            <tbody>
              {r.porTecnico.map(([nome, t]) => (
                <tr key={nome} className="border-t border-gray-100">
                  <td className="p-3">{nome}</td>
                  <td className="p-3 text-right">{t.total}</td>
                  <td className="p-3 text-right">{t.finalizadas}</td>
                  <td className="p-3 text-right">{t.comSla ? `${Math.round((t.noPrazo / t.comSla) * 100)}%` : "—"}</td>
                  <td className="p-3 text-right">{fmtH(media(t.exec))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-200 p-4 font-semibold">Por tipo de O.S.</h3>
          <ul className="p-4 text-sm">
            {r.porTipo.map(([tipo, n]) => (
              <li key={tipo} className="mb-2">
                <div className="flex justify-between"><span>{tipo}</span><span className="font-medium">{n}</span></div>
                <div className="mt-1 h-2 rounded bg-gray-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${(n / maxTipo) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <h3 className="border-b border-gray-200 p-4 font-semibold">Consumo de material nas O.S.</h3>
        {r.materiais.length === 0 ? <p className="p-4 text-sm text-gray-500">Nenhum consumo no período.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {r.materiais.map(([nome, m]) => (
                <tr key={nome} className="border-t border-gray-100 first:border-0">
                  <td className="p-3">{nome}</td>
                  <td className="p-3 text-right font-medium">{fmt(m.qtd)} {m.unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
