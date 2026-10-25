"use client";

import { useEffect, useMemo, useState } from "react";

import CaixaDetalhe, { CaixaPainel, ehPonta, origemDe } from "@/componentes/CaixaDetalhe";
import { clienteDoCaminho, descreverFibra, faixasDaBandeja, FotoKmz, htmlPreviaPlano, localDgo, midiasKmz, posicoesDgo, rastrearFibra, rotuloInstalacao, rotuloPonto, separarBandejas, VALIDADE_LINK_FOTO_KMZ } from "@/lib/fusao";
import { excluirComConfirmacao } from "@/lib/excluir";
import { supabase } from "@/lib/supabase";

const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fotos da acomodação / DGO e das bandejas de cada caixa, como links longos (o Google Earth só aceita foto por link).
async function fotosParaKmz(caixas: CaixaPainel[]) {
  const porCaixa: Record<string, FotoKmz[]> = {};
  const ids = caixas.map((c) => c.id);
  const tipoDe = new Map(caixas.map((c) => [c.id, c.tipo]));
  for (let i = 0; i < ids.length; i += 100) {
    const { data: anexos } = await supabase.from("os_anexos").select("caminho_arquivo, tipo, caixa_id, bandeja")
      .in("caixa_id", ids.slice(i, i + 100)).in("tipo", ["foto_caixa", "foto_olt", "foto_bandeja"]).order("tipo").order("bandeja").order("criado_em");
    if (!anexos?.length) continue;
    const { data: urls } = await supabase.storage.from("os-anexos").createSignedUrls(anexos.map((a) => a.caminho_arquivo), VALIDADE_LINK_FOTO_KMZ);
    anexos.forEach((a, j) => {
      const url = urls?.[j]?.signedUrl;
      if (!url) return;
      (porCaixa[a.caixa_id] ??= []).push({ url, legenda: a.tipo === "foto_olt" ? "OLT e cordões" : a.tipo === "foto_bandeja"
        ? `Bandeja ${a.bandeja ?? "?"} · fibras acomodadas` : tipoDe.get(a.caixa_id) === "dgo" ? "DGO" : "Acomodação da caixa" });
    });
  }
  return porCaixa;
}

// KMZ com um pin por caixa / DGO / site de parceiro e, na descrição, a prévia do plano de fusão com os clientes.
// rede: todas as caixas conhecidas, para achar a posição no DGO de cada fibra mesmo que o DGO não esteja no arquivo.
export async function baixarKmz(caixas: CaixaPainel[], arquivo = `caixas-emenda-${new Date().toISOString().slice(0, 10)}`, rede: CaixaPainel[] = caixas) {
  const fotos = await fotosParaKmz(caixas.filter((c) => c.latitude != null));
  const estilos = { emenda: "ff00a5ff", entroncamento: "ff0000ff", dgo: "ffff0000", site: "ff00b000" } as Record<string, string>;
  const pins = caixas.filter((c) => c.latitude != null).map((c) => {
    const linhas = [
      `${rotuloPonto(c.tipo)}${rotuloInstalacao(c.instalacao) ? ` · ${rotuloInstalacao(c.instalacao)}` : ""} · O.S. ${c.os_numero}${c.trecho ? ` · ${c.trecho}` : ""}`,
      c.parceiro ? `Parceiro: ${c.parceiro}` : null,
      localDgo(c) || null,
      origemDe(c) ? `Vem de: ${origemDe(c)}${c.origem_saida ? ` (saída ${c.origem_saida})` : ""}` : null,
      `Entrada ${c.capacidade_fibras} FO → ${c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(", ") || "sem saída"}`,
      `Grupos: ${c.grupos_fusionados} fusionados, ${c.grupos_vagos} vagos`,
      ...(c.tipo === "dgo" ? [] : separarBandejas(c)).map((b) => `Bandeja ${b.numero}: ${b.ligacoes.length} fusões (${faixasDaBandeja(b)})`),
      ...c.manobras.map((m) => `Manobra: ${descreverFibra(m.fibra_entrada, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)} → Saída ${m.saida} FO ${m.fibra_saida}${m.motivo ? ` (${m.motivo})` : ""}`),
      c.observacao ? `Obs.: ${c.observacao}` : null,
      c.tecnico ? `Técnico: ${c.tecnico}` : null,
    ].filter(Boolean);
    return `    <Placemark>
      <name>${esc(c.identificacao)}</name>
      <styleUrl>#${c.tipo}</styleUrl>
      <description><![CDATA[${linhas.map(esc).join("<br>")}${htmlPreviaPlano({ ...c, posicoes_dgo: posicoesDgo(rede, c) })}]]></description>
      ${midiasKmz(fotos[c.id] ?? [])}
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
  a.download = `${arquivo}.kmz`;
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
                    <b>{c.identificacao}</b> <span className="text-gray-500">({rotuloPonto(c.tipo)})</span> · {c.tipo === "dgo"
                      ? <>posição <b>{c.fibras?.find((f) => f.fibra === p.fibraEntrada)?.posicao_dgo ?? `FO ${p.fibraEntrada}`}</b>{localDgo(c) ? ` (${localDgo(c)})` : ""}</>
                      : <>entra na {descreverFibra(p.fibraEntrada, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)}</>}
                    {p.saida ? <> → sai {c.tipo === "dgo" ? "no cabo" : "na Saída"} {p.saida}, {descreverFibra(p.fibraSaida!, c.saidas[p.saida - 1] ?? c.capacidade_fibras, c.padrao_cores_saidas?.[p.saida - 1] ?? undefined)}</> : <span className="text-gray-500"> · a fibra termina aqui</span>}
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
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => baixarKmz(filtradas, undefined, caixas)}>
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
              {aberta === c.id && (
                <div className="px-4 pb-4">
                  <CaixaDetalhe caixa={c} />
                  <button className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      const { data: fotos } = await supabase.from("os_anexos").select("caminho_arquivo").eq("caixa_id", c.id);
                      const ok = await excluirComConfirmacao(`${c.identificacao} com fibras, manobras e ${fotos?.length ?? 0} foto(s)`, async () => {
                        const f = await supabase.from("os_anexos").delete().eq("caixa_id", c.id);
                        return f.error ? f : supabase.from("caixas_emenda").delete().eq("id", c.id);
                      });
                      if (!ok) return;
                      const arquivos = (fotos ?? []).map((x) => x.caminho_arquivo).filter(Boolean);
                      if (arquivos.length) await supabase.storage.from("os-anexos").remove(arquivos);
                      setCaixas((l) => l.filter((x) => x.id !== c.id));
                      setAberta(null);
                    }}>
                    Excluir {c.identificacao}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
