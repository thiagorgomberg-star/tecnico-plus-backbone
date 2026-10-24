"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Expediente = { id: string; tecnico_id: string; inicio: string; fim: string | null; km_inicial: number | null; km_final: number | null; distancia_gps_km: number | null };

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "em aberto");
const numero = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\D/g, "")));

// Km de início/fim que o técnico digita no expediente: o supervisor corrige ou apaga lançamentos errados.
export default function KmExpedientes({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [lista, setLista] = useState<Expediente[]>([]);
  const [tecnico, setTecnico] = useState("");
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const nome = (id: string) => tecnicos.find((t) => t.id === id)?.nome ?? "—";

  useEffect(() => {
    let q = supabase.from("expedientes").select("id, tecnico_id, inicio, fim, km_inicial, km_final, distancia_gps_km")
      .order("inicio", { ascending: false }).limit(60);
    if (tecnico) q = q.eq("tecnico_id", tecnico);
    q.then(({ data }) => setLista((data as Expediente[]) ?? []));
  }, [tecnico, versao]);

  async function salvar(e: Expediente, campos: Partial<Pick<Expediente, "km_inicial" | "km_final">>) {
    const novo = { ...e, ...campos };
    if (novo.km_inicial != null && novo.km_final != null && novo.km_final < novo.km_inicial) {
      alert("O km final não pode ser menor que o inicial.");
      return recarregar();
    }
    const { error } = await supabase.from("expedientes").update(campos).eq("id", e.id);
    if (error) alert(error.message);
    recarregar();
  }

  async function apagar(e: Expediente) {
    if (!confirm(`Apagar os km lançados por ${nome(e.tecnico_id)} no expediente de ${quando(e.inicio)}?`)) return;
    if (prompt("Para confirmar, digite EXCLUIR:")?.trim().toUpperCase() !== "EXCLUIR") return alert("Nada foi apagado.");
    salvar(e, { km_inicial: null, km_final: null });
  }

  const campoKm = (e: Expediente, k: "km_inicial" | "km_final") => (
    <input key={`${e.id}-${k}-${e[k]}`} className="w-28 rounded border border-gray-200 px-2 py-1 text-right" inputMode="numeric"
      defaultValue={e[k] ?? ""} placeholder="—"
      onBlur={(ev) => numero(ev.target.value) !== e[k] && salvar(e, { [k]: numero(ev.target.value) })} />
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
        <h2 className="mr-auto text-lg font-semibold">Km lançados nos expedientes</h2>
        <select className="rounded-lg border border-gray-300 p-2 text-sm" value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </div>
      <p className="px-4 pt-3 text-xs text-gray-500">Clique no número para corrigir. &quot;Apagar km&quot; remove o km inicial e o final daquele expediente.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-gray-500">
            <tr><th className="p-3">Técnico</th><th className="p-3">Início</th><th className="p-3">Fim</th><th className="p-3 text-right">Km inicial</th>
              <th className="p-3 text-right">Km final</th><th className="p-3 text-right">Rodado</th><th className="p-3 text-right">GPS</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={8} className="p-4 text-gray-500">Nenhum expediente.</td></tr>}
            {lista.map((e) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="p-3">{nome(e.tecnico_id)}</td>
                <td className="p-3 whitespace-nowrap">{quando(e.inicio)}</td>
                <td className="p-3 whitespace-nowrap">{quando(e.fim)}</td>
                <td className="p-3 text-right">{campoKm(e, "km_inicial")}</td>
                <td className="p-3 text-right">{campoKm(e, "km_final")}</td>
                <td className="p-3 text-right">{e.km_inicial != null && e.km_final != null ? `${(e.km_final - e.km_inicial).toLocaleString("pt-BR")} km` : "—"}</td>
                <td className="p-3 text-right text-gray-500">{e.distancia_gps_km != null ? `${e.distancia_gps_km} km` : "—"}</td>
                <td className="p-3 text-right">
                  {(e.km_inicial != null || e.km_final != null) && (
                    <button className="text-xs text-red-700 hover:underline" onClick={() => apagar(e)}>Apagar km</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
