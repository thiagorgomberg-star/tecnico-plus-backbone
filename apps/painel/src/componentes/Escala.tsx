"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type TipoEscala = "jornada" | "folga_programada" | "plantao" | "sobreaviso" | "ferias" | "atestado" | "outro";
type Item = { id: string; tecnico_id: string; data: string; tipo: TipoEscala; inicio: string | null; fim: string | null; observacao: string | null };

const TIPOS: { valor: TipoEscala; rotulo: string; cor: string }[] = [
  { valor: "jornada", rotulo: "Jornada", cor: "bg-blue-100 text-blue-800" },
  { valor: "folga_programada", rotulo: "Folga programada", cor: "bg-green-100 text-green-800" },
  { valor: "plantao", rotulo: "Plantão", cor: "bg-red-100 text-red-800" },
  { valor: "sobreaviso", rotulo: "Sobreaviso", cor: "bg-amber-100 text-amber-800" },
  { valor: "ferias", rotulo: "Férias", cor: "bg-cyan-100 text-cyan-800" },
  { valor: "atestado", rotulo: "Atestado", cor: "bg-purple-100 text-purple-800" },
  { valor: "outro", rotulo: "Outro", cor: "bg-gray-100 text-gray-700" },
];
const tipo = (v: TipoEscala) => TIPOS.find((t) => t.valor === v)!;
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Escala({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [tecnicoId, setTecnicoId] = useState("");
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [itens, setItens] = useState<Item[]>([]);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const [form, setForm] = useState({ data: "", tipo: "folga_programada" as TipoEscala, inicio: "", fim: "", observacao: "" });

  const tecnicoAtual = tecnicoId || tecnicos[0]?.id || "";
  const dias = useMemo(() => {
    const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    return Array.from({ length: total }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1));
  }, [mes]);

  useEffect(() => {
    if (!tecnicoAtual) return;
    supabase.from("escala").select("*").eq("tecnico_id", tecnicoAtual)
      .gte("data", iso(dias[0])).lte("data", iso(dias[dias.length - 1])).order("data")
      .then(({ data }) => setItens(data ?? []));
  }, [tecnicoAtual, dias, versao]);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("escala").upsert({
      tecnico_id: tecnicoAtual, data: form.data, tipo: form.tipo,
      inicio: form.inicio || null, fim: form.fim || null, observacao: form.observacao || null,
    }, { onConflict: "tecnico_id,data,tipo" });
    if (error) return alert(error.message);
    setForm({ ...form, data: "", observacao: "" });
    recarregar();
  }

  async function remover(item: Item) {
    if (!confirm(`Remover ${tipo(item.tipo).rotulo} de ${item.data.split("-").reverse().join("/")}?`)) return;
    const { error } = await supabase.from("escala").delete().eq("id", item.id);
    if (error) return alert(error.message);
    recarregar();
  }

  // Preenche o mês: jornada de segunda a sexta e plantão no sábado e domingo.
  async function preencherMes() {
    const linhas = dias.map((d) => {
      const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
      return {
        tecnico_id: tecnicoAtual, data: iso(d), tipo: fimDeSemana ? "plantao" : "jornada",
        inicio: fimDeSemana ? null : "08:00", fim: fimDeSemana ? null : "17:00",
      };
    });
    const { error } = await supabase.from("escala").upsert(linhas, { onConflict: "tecnico_id,data,tipo", ignoreDuplicates: true });
    if (error) return alert(error.message);
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2";
  const nomeMes = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
        <select className={campo} value={tecnicoAtual} onChange={(e) => setTecnicoId(e.target.value)}>
          {tecnicos.length === 0 && <option value="">Nenhum técnico cadastrado</option>}
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <button className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
          <span className="w-40 text-center font-medium capitalize">{nomeMes}</span>
          <button className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
        </div>
        <button className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
          disabled={!tecnicoAtual} onClick={preencherMes}>
          Preencher mês (Seg–Sex jornada 08h–17h, Sáb/Dom plantão)
        </button>
      </div>

      <form onSubmit={lancar} className="grid gap-2 border-b border-gray-100 p-4 sm:grid-cols-[auto_auto_auto_auto_1fr_auto]">
        <input className={campo} type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
        <select className={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoEscala })}>
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
        <input className={campo} type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} title="Início" />
        <input className={campo} type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} title="Fim" />
        <input className={campo} placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-40" disabled={!tecnicoAtual}>Lançar</button>
      </form>

      <div className="grid grid-cols-7 gap-px bg-gray-200 text-xs">
        {DIAS.map((d) => <div key={d} className="bg-gray-50 p-2 text-center font-semibold text-gray-600">{d}</div>)}
        {Array.from({ length: dias[0].getDay() }, (_, i) => <div key={`v${i}`} className="bg-white" />)}
        {dias.map((d) => {
          const doDia = itens.filter((i) => i.data === iso(d));
          return (
            <div key={d.getDate()} className="min-h-24 bg-white p-1.5">
              <div className="mb-1 font-semibold text-gray-500">{d.getDate()}</div>
              {doDia.map((i) => (
                <button key={i.id} onClick={() => remover(i)} title="Clique para remover"
                  className={`mb-1 block w-full truncate rounded px-1 py-0.5 text-left ${tipo(i.tipo).cor}`}>
                  {tipo(i.tipo).rotulo}{i.inicio ? ` ${i.inicio.slice(0, 5)}` : ""}{i.fim ? `–${i.fim.slice(0, 5)}` : ""}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
