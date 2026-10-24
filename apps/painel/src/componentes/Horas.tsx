"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { baixarXlsx } from "@/lib/planilha";
import { supabase } from "@/lib/supabase";

type Dia = {
  tecnico_id: string; tecnico: string; regime: string; data: string; tipo_dia: string;
  esperado_min: number; trabalhado_min: number; extra50_min: number; extra100_min: number; falta_min: number; sobreaviso_min: number; banco_min: number;
};

const TIPO_DIA: Record<string, string> = {
  util: "Dia útil", sabado: "Sábado", domingo: "Domingo", feriado: "Feriado",
  folga_programada: "Folga", ferias: "Férias", atestado: "Atestado",
};
const hm = (min: number) => {
  if (!min) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};
const semana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const mesAtual = () => new Date().toISOString().slice(0, 7);

// Apuração mensal pela CLT: extra 50% (dia útil e sábado), 100% (domingo e feriado), sobreaviso a 1/3 e banco de horas.
export default function Horas() {
  const [mes, setMes] = useState(mesAtual());
  const [dias, setDias] = useState<Dia[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    supabase.rpc("apuracao_horas", { p_de: `${mes}-01`, p_ate: ultimo }).then(({ data, error }) => {
      if (error) alert(error.message);
      setDias((data as Dia[]) ?? []);
    });
  }, [mes]);

  const porTecnico = useMemo(() => {
    const m = new Map<string, { nome: string; regime: string; dias: Dia[]; t: Record<string, number> }>();
    for (const d of dias) {
      if (!m.has(d.tecnico_id)) m.set(d.tecnico_id, { nome: d.tecnico, regime: d.regime, dias: [], t: {} });
      const g = m.get(d.tecnico_id)!;
      g.dias.push(d);
      for (const k of ["esperado_min", "trabalhado_min", "extra50_min", "extra100_min", "falta_min", "sobreaviso_min", "banco_min"] as const) {
        g.t[k] = (g.t[k] ?? 0) + d[k];
      }
    }
    return [...m.entries()];
  }, [dias]);

  async function exportar() {
    const cab = ["Técnico", "Regime", "Data", "Dia", "Tipo do dia", "Jornada (h)", "Trabalhado (h)", "Extra 50% (h)", "Extra 100% (h)",
      "Falta (h)", "Sobreaviso (h)", "Sobreaviso a pagar (h = 1/3)", "Banco de horas (h)"];
    const h = (min: number) => Math.round((min / 60) * 100) / 100;
    const linhas = dias.map((d) => [
      d.tecnico, d.regime === "banco_horas" ? "Banco de horas" : "Hora extra", new Date(`${d.data}T12:00:00`),
      semana[new Date(`${d.data}T12:00:00`).getDay()], TIPO_DIA[d.tipo_dia] ?? d.tipo_dia,
      h(d.esperado_min), h(d.trabalhado_min), h(d.extra50_min), h(d.extra100_min), h(d.falta_min), h(d.sobreaviso_min),
      h(d.sobreaviso_min / 3), h(d.banco_min),
    ]);
    await baixarXlsx(`Horas ${mes}`, `Horas ${mes}`, cab, linhas, cab.map((_, i) => i >= 5));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Horas extras e banco de horas</h2>
        <input type="month" className="rounded-lg border border-gray-300 p-2 text-sm" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
        <button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!dias.length}
          onClick={exportar}>Baixar planilha (Excel)</button>
      </div>
      <p className="text-xs text-gray-500">
        Controle interno (o ponto oficial é o Sólides; o técnico não vê esta tela). Calculado dos expedientes no app, menos as refeições. Dia útil e sábado: 50%. Domingo e feriado nacional: 100%.
        Plantão sem trabalho: sobreaviso a 1/3 da hora. Diferença de até 10 min no dia não conta. Faltas só em dias já passados.
        Banco de horas: crédito 1 para 1.
      </p>

      <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="p-3">Técnico</th><th className="p-3">Regime</th><th className="p-3 text-right">Trabalhado</th>
              <th className="p-3 text-right">Extra 50%</th><th className="p-3 text-right">Extra 100%</th><th className="p-3 text-right">Faltas</th>
              <th className="p-3 text-right">Sobreaviso</th><th className="p-3 text-right">Saldo banco</th>
            </tr>
          </thead>
          <tbody>
            {porTecnico.map(([id, g]) => (
              <Fragment key={id}>
                <tr className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setAberto(aberto === id ? null : id)}>
                  <td className="p-3 font-medium">{aberto === id ? "▾" : "▸"} {g.nome}</td>
                  <td className="p-3">{g.regime === "banco_horas" ? "Banco de horas" : "Hora extra"}</td>
                  <td className="p-3 text-right">{hm(g.t.trabalhado_min)}</td>
                  <td className="p-3 text-right">{hm(g.t.extra50_min)}</td>
                  <td className="p-3 text-right">{hm(g.t.extra100_min)}</td>
                  <td className={`p-3 text-right ${g.t.falta_min ? "text-red-700" : ""}`}>{hm(g.t.falta_min)}</td>
                  <td className="p-3 text-right">{hm(g.t.sobreaviso_min)}{g.t.sobreaviso_min ? <span className="text-xs text-gray-500"> (paga {hm(Math.round(g.t.sobreaviso_min / 3))})</span> : null}</td>
                  <td className={`p-3 text-right font-medium ${g.t.banco_min < 0 ? "text-red-700" : ""}`}>{g.regime === "banco_horas" ? hm(g.t.banco_min) : "—"}</td>
                </tr>
                {aberto === id && g.dias.map((d) => (
                  <tr key={d.data} className="border-t border-gray-50 bg-gray-50/60 text-xs">
                    <td className="p-2 pl-8">{d.data.split("-").reverse().join("/")} {semana[new Date(`${d.data}T12:00:00`).getDay()]}</td>
                    <td className="p-2">{TIPO_DIA[d.tipo_dia] ?? d.tipo_dia}{d.esperado_min ? ` · jornada ${hm(d.esperado_min)}` : ""}</td>
                    <td className="p-2 text-right">{hm(d.trabalhado_min)}</td>
                    <td className="p-2 text-right">{hm(d.extra50_min)}</td>
                    <td className="p-2 text-right">{hm(d.extra100_min)}</td>
                    <td className={`p-2 text-right ${d.falta_min ? "text-red-700" : ""}`}>{hm(d.falta_min)}</td>
                    <td className="p-2 text-right">{hm(d.sobreaviso_min)}</td>
                    <td className="p-2 text-right">{g.regime === "banco_horas" ? hm(d.banco_min) : ""}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {porTecnico.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum técnico ativo.</p>}
      </section>
    </div>
  );
}
