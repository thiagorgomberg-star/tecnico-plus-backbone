"use client";

import { useEffect, useMemo, useState } from "react";

import CaixaDetalhe, { CaixaPainel, ehPonta, origemDe } from "@/componentes/CaixaDetalhe";
import { clienteDoCaminho, descreverFibra, rastrearFibra, rotuloPonto } from "@/lib/fusao";
import { supabase } from "@/lib/supabase";

const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// KMZ com um pin por caixa / DGO e, na descrição, o plano de fusão, manobras e clientes.
async function baixarKmz(caixas: CaixaPainel[]) {
  const estilos = { emenda: "ff00a5ff", entroncamento: "ff0000ff", dgo: "ffff0000" } as Record<string, string>;
  const pins = caixas.filter((c) => c.latitude != null).map((c) => {
    const linhas = [
      `${rotuloPonto(c.tipo)} · O.S. ${c.os_numero}${c.trecho ? ` · ${c.trecho}` : ""}`,
      origemDe(c) ? `Vem de: ${origemDe(c)}${c.origem_saida ? ` (saída ${c.origem_saida})` : ""}` : null,
      `Entrada ${c.capacidade_fibras} FO → ${c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(", ") || "sem saída"}`,
      `Grupos: ${c.grupos_fusionados} fusionados, ${c.grupos_vagos} vagos`,
      ...c.manobras.map((m) => `Manobra: ${descreverFibra(m.fibra_entrada, c.capacidade_fibras)} → Saída ${m.saida} FO ${m.fibra_saida}${m.motivo ? ` (${m.motivo})` : ""}`),
      ...(c.fibras ?? []).map((f) => `Fibra ${f.fibra}: ${[f.cliente, f.sem_potencia ? "SEM POTÊNCIA" : null,
        f.potencia_dbm != null ? `${f.potencia_dbm} dBm` : null, f.reflexao_db != null ? `reflexão ${f.reflexao_db} dB` : null,
        f.perda_db_km != null ? `${f.perda_db_km} dB/km` : null].filter(Boolean).join(" · ")}`),
      c.observacao ? `Obs.: ${c.observacao}` : null,
      c.tecnico ? `Técnico: ${c.tecnico}` : null,
    ].filter(Boolean);
    return `    <Placemark>
      <name>${esc(c.identificacao)}</name>
      <styleUrl>#${c.tipo}</styleUrl>
      <description><![CDATA[${linhas.map(esc).join("<br>")}]]></description>
      <Point><coordinates>${c.longitude},${c.latitude},0</coordinates></Point>
    </Placemark>`;
  });
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Caixas de emenda - Técnico Plus</name>
${Object.entries(estilos).map(([id, cor]) => `    <Style id="${id}"><IconStyle><color>${cor}</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join("\n")}
${pins.join("\n")}
  </Document>
</kml>
`;
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caixas-emenda-${new Date().toISOString().slice(0, 10)}.kmz`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CaixasRede() {
  const [caixas, setCaixas] = useState<CaixaPainel[]>([]);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [rastreio, setRastreio] = useState({ caixaId: "", fibra: "", cliente: "" });

  useEffect(() => {
    supabase.from("caixas_mapa").select("*").order("atualizado_em", { ascending: false })
      .then(({ data }) => setCaixas((data as unknown as CaixaPainel[]) ?? []));
  }, []);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return caixas;
    return caixas.filter((c) => [c.identificacao, c.trecho, c.endereco, ...(c.fibras ?? []).map((f) => f.cliente)]
      .some((v) => v?.toLowerCase().includes(t)));
  }, [caixas, busca]);

  // Rastreio pela caixa+fibra ou pelo nome do cliente (primeira caixa onde ele aparece).
  const caminho = useMemo(() => {
    let caixaId = rastreio.caixaId;
    let fibra = Number(rastreio.fibra);
    const cliente = rastreio.cliente.trim().toLowerCase();
    if (cliente) {
      const achada = caixas.find((c) => c.fibras?.some((f) => f.cliente?.toLowerCase().includes(cliente)));
      const f = achada?.fibras?.find((x) => x.cliente?.toLowerCase().includes(cliente));
      if (!achada || !f) return null;
      caixaId = achada.id;
      fibra = f.fibra;
    }
    if (!caixaId || !fibra) return null;
    const r = rastrearFibra(caixas.map((c) => ({ ...c, origem: origemDe(c) })), caixaId, fibra);
    return { ...r, cliente: clienteDoCaminho(r.passos) };
  }, [caixas, rastreio]);

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 p-4 font-semibold">Rastrear fibra (ponta A → ponta B)</h2>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input className={`${campo} min-w-48 flex-1`} placeholder="Cliente" value={rastreio.cliente}
            onChange={(e) => setRastreio({ caixaId: "", fibra: "", cliente: e.target.value })} />
          <span className="text-sm text-gray-500">ou</span>
          <select className={campo} value={rastreio.caixaId} onChange={(e) => setRastreio({ ...rastreio, cliente: "", caixaId: e.target.value })}>
            <option value="">Caixa...</option>
            {caixas.map((c) => <option key={c.id} value={c.id}>{c.identificacao}</option>)}
          </select>
          <input className={`${campo} w-24`} placeholder="Fibra" inputMode="numeric" value={rastreio.fibra}
            onChange={(e) => setRastreio({ ...rastreio, cliente: "", fibra: e.target.value })} />
        </div>
        {caminho && caminho.passos.length > 0 && (
          <div className="px-4 pb-4 text-sm">
            <p className="mb-2">
              {caminho.cliente?.cliente ? <>Cliente <b>{caminho.cliente.cliente}</b>. </> : null}
              {caminho.cliente?.sem_potencia ? <b className="text-red-700">Sem potência. </b> : null}
              Ponta A: <b>{caminho.pontaA ?? caminho.passos[0].caixa.identificacao}</b> · Ponta B: <b>{caminho.passos[caminho.passos.length - 1].caixa.identificacao}</b>
            </p>
            <ol className="border-l-2 border-gray-200 pl-4">
              {caminho.passos.map((p, i) => {
                const c = p.caixa as CaixaPainel;
                const medida = ehPonta(c.tipo) ? c.fibras?.find((f) => f.fibra === p.fibraEntrada) : null;
                return (
                  <li key={i} className="mb-2">
                    <b>{c.identificacao}</b> <span className="text-gray-500">({rotuloPonto(c.tipo)})</span> · entra na {descreverFibra(p.fibraEntrada, c.capacidade_fibras)}
                    {p.saida ? <> → sai na Saída {p.saida}, FO {p.fibraSaida}</> : <span className="text-gray-500"> · a fibra termina aqui</span>}
                    {p.manobra && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-800">MANOBRA{p.motivo ? `: ${p.motivo}` : ""}</span>}
                    {medida && (medida.potencia_dbm != null || medida.reflexao_db != null || medida.perda_db_km != null) && (
                      <div className="text-xs text-gray-600">
                        Sinal {medida.potencia_dbm ?? "—"} dBm · Reflexão {medida.reflexao_db ?? "—"} dB · Perda {medida.perda_db_km ?? "—"} dB/km
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {caminho === null && (rastreio.cliente || (rastreio.caixaId && rastreio.fibra)) && (
          <p className="px-4 pb-4 text-sm text-gray-500">Nada encontrado.</p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
          <h2 className="font-semibold">Caixas e DGOs ({caixas.length})</h2>
          <input className={`${campo} ml-auto min-w-56`} placeholder="Buscar por caixa, trecho ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => baixarKmz(filtradas)}>
            Baixar KMZ ({filtradas.filter((c) => c.latitude != null).length})
          </button>
        </div>
        {filtradas.length === 0 && <p className="p-6 text-center text-sm text-gray-500">Nenhuma caixa cadastrada ainda.</p>}
        <ul>
          {filtradas.map((c) => (
            <li key={c.id} className="border-b border-gray-100 last:border-0">
              <button className="flex w-full flex-wrap items-center gap-2 p-4 text-left text-sm hover:bg-gray-50" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                <b>{c.identificacao}</b>
                <span className="text-gray-500">{rotuloPonto(c.tipo)}{c.trecho ? ` · ${c.trecho}` : ""}{origemDe(c) ? ` · vem de ${origemDe(c)}` : ""}</span>
                <span className="ml-auto text-gray-500">
                  {c.capacidade_fibras} FO · {c.manobras.length} manobra(s)
                  {(c.fibras ?? []).some((f) => f.sem_potencia) ? <b className="ml-1 text-red-700">· sem potência</b> : null}
                  {c.latitude == null ? <span className="ml-1 text-red-700">· sem GPS</span> : null}
                </span>
              </button>
              {aberta === c.id && <div className="px-4 pb-4"><CaixaDetalhe caixa={c} /></div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
