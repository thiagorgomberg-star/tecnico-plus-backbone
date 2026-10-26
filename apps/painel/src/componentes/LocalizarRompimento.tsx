"use client";

import { useEffect, useMemo, useState } from "react";

import { CaixaPainel, origemDe } from "@/componentes/CaixaDetalhe";
import { supabase } from "@/lib/supabase";
import { descreverRompimento, fmtMetros, kmlRompimento, lancesDoEnlace, localizarRompimento, rotuloPonto, sentidoPadrao } from "@/lib/fusao";

const numero = (t: string) => {
  const v = Number(t.replace(",", "."));
  return t.trim() && Number.isFinite(v) ? v : null;
};

// Enlace pela metragem do cabo e simulação do local de rompimento pela distância medida no OTDR
// (medição feita num DGO, entroncamento ou caixa). Ferramenta à parte: usa o mapeamento e a metragem já lançados.
export default function LocalizarRompimento() {
  const [caixas, setCaixas] = useState<CaixaPainel[]>([]);
  useEffect(() => {
    supabase.from("caixas_mapa").select("*").then(({ data }) => setCaixas((data as unknown as CaixaPainel[]) ?? []));
  }, []);
  const [medicaoId, setMedicaoId] = useState("");
  const [fibra, setFibra] = useState("1");
  const [km, setKm] = useState("");
  const [excesso, setExcesso] = useState("");
  const [sentido, setSentido] = useState<"frente" | "tras">("frente");

  const rede = useMemo(() => caixas.map((c) => ({ ...c, origem: origemDe(c) })), [caixas]);
  const medicao = rede.find((c) => c.id === medicaoId) ?? null;
  // Pontas primeiro: a medição costuma ser no DGO ou no entroncamento.
  const opcoes = useMemo(() => [...rede].sort((a, b) => Number(b.tipo === "dgo" || b.tipo === "entroncamento") - Number(a.tipo === "dgo" || a.tipo === "entroncamento")
    || a.identificacao.localeCompare(b.identificacao)), [rede]);

  const lances = useMemo(() => (medicao && numero(fibra) ? lancesDoEnlace(rede, medicao.id, numero(fibra)!, sentido) : []), [rede, medicao, fibra, sentido]);
  const total = lances.reduce((s, l) => s + l.reservaDe + (l.metros ?? 0), 0);
  const distancia = numero(km);
  const r = medicao && distancia != null ? localizarRompimento(lances, distancia, numero(excesso) ?? 0) : null;
  const ponto = r && r.tipo !== "sem_medida" && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;

  function baixarKml() {
    if (!r || !medicao || distancia == null) return;
    const kml = kmlRompimento(r, medicao, distancia, `Rompimento a ${km} km de ${medicao.identificacao}`);
    if (!kml) return;
    const url = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rompimento-${medicao.identificacao}-${km.replace(",", ".")}km.kml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Localizar rompimento (OTDR) e metragem do enlace</h2>
      <div className="flex flex-wrap items-end gap-2 p-4">
        <label className="grid gap-1 text-xs text-gray-500">Medição feita em
          <select className={campo} value={medicaoId} onChange={(e) => {
            setMedicaoId(e.target.value);
            const c = rede.find((x) => x.id === e.target.value);
            if (c) setSentido(sentidoPadrao(c));
          }}>
            <option value="">DGO, entroncamento ou caixa...</option>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.identificacao} · {rotuloPonto(c.tipo, c.swap)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Fibra
          <input className={`${campo} w-20`} inputMode="numeric" value={fibra} onChange={(e) => setFibra(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Sentido da medição
          <select className={campo} value={sentido} onChange={(e) => setSentido(e.target.value as "frente" | "tras")}>
            <option value="frente">Para frente (saídas)</option>
            <option value="tras">Para trás (de onde vem)</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Distância do evento (km)
          <input className={`${campo} w-32`} inputMode="decimal" placeholder="Ex.: 1,100" value={km} onChange={(e) => setKm(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Excesso de fibra (%)
          <input className={`${campo} w-24`} inputMode="decimal" placeholder="0" value={excesso} onChange={(e) => setExcesso(e.target.value)} />
        </label>
      </div>

      {medicao && (
        <div className="px-4 pb-4 text-sm">
          {lances.length === 0 ? (
            <p className="text-gray-500">Nenhum ponto cadastrado {sentido === "frente" ? "depois" : "antes"} de {medicao.identificacao} nessa fibra.</p>
          ) : (
            <table className="w-full">
              <thead className="text-left text-xs text-gray-500">
                <tr><th className="py-1">Lance</th><th>Comprimento</th><th>Como foi medido</th><th>Reservas</th><th>Acumulado</th></tr>
              </thead>
              <tbody>
                {(() => {
                  let acumulado = 0;
                  return lances.map((l, i) => {
                    acumulado += l.reservaDe + (l.metros ?? 0);
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1"><b>{l.de.identificacao}</b> → <b>{l.para.identificacao}</b></td>
                        <td>{l.metros == null ? "—" : fmtMetros(l.metros)}</td>
                        <td className={l.fonte === "cabo" ? "text-green-700" : "text-amber-700"}>
                          {l.fonte === "cabo" ? `metragem do cabo (${l.marcaDe} → ${l.marcaPara})` : l.fonte === "gps" ? "estimado pelo GPS" : "sem metragem nem GPS"}
                        </td>
                        <td className="text-xs">
                          {[l.reservaDe ? `${l.reservaDe} m em ${l.de.identificacao}` : null,
                            ...l.reservas.map((x) => `${x.metros} m no caminho${x.obs ? ` (${x.obs})` : ""}`)].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td>{fmtMetros(acumulado)}</td>
                      </tr>
                    );
                  });
                })()}
                <tr className="border-t border-gray-200 font-semibold"><td className="py-1">Enlace</td><td colSpan={3} /><td>{fmtMetros(total)}</td></tr>
              </tbody>
            </table>
          )}

          {r && (
            <div className={`mt-4 rounded-lg border-2 p-4 ${r.tipo === "sem_medida" ? "border-amber-400" : "border-red-500"}`}>
              <div className="text-xs font-bold uppercase tracking-wide text-red-700">{r.tipo === "sem_medida" ? "Falta dado para calcular" : "Possível rompimento"}</div>
              <div className="mt-1 text-base font-semibold">{descreverRompimento(r)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Medição em <b>{medicao.identificacao}</b> ({rotuloPonto(medicao.tipo, medicao.swap)}), fibra {fibra}, {km} km{numero(excesso) ? `, excesso ${excesso}%` : ""}.
                {ponto ? ` Coordenadas ${ponto.lat.toFixed(6)}, ${ponto.lng.toFixed(6)}.` : ""}
              </div>
              {ponto && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${ponto.lat},${ponto.lng}`}>Ver no Google Maps</a>
                  <button className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={baixarKml}>
                    Baixar KML (ponto + medição)
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Lance pela metragem do cabo quando há a marca na saída do ponto anterior e na entrada do seguinte; sem elas, linha reta pelo GPS mais as reservas anotadas.
          </p>
        </div>
      )}
    </section>
  );
}
