// KMZ das caixas de emenda (painel e backup semanal). Recebe o cliente do Supabase para rodar também fora do navegador.
import type { SupabaseClient } from "@supabase/supabase-js";

import { CaixaRede, kmlLances, descreverFibra, descreverSaidas, faixasDaBandeja, FotoKmz, htmlPreviaPlano, localDgo, midiasKmz, origemNaoCadastrada, posicoesDgo, rotuloInstalacao, rotuloPonto, separarBandejas, VALIDADE_LINK_FOTO_KMZ } from "./fusao";

// Sem imports do painel além de fusao.ts: a função backup-drive do Supabase usa uma cópia idêntica deste arquivo.
export type CaixaKmz = CaixaRede & {
  tipo: string; os_numero: number; trecho: string | null; tecnico: string | null; latitude: number | null; longitude: number | null;
  grupos_fusionados: number; grupos_vagos: number; observacao: string | null; origem_identificacao: string | null;
  parceiro?: string | null; instalacao?: string | null; bastidor?: string | null; fila?: string | null; rack?: string | null;
};

const origemDe = (c: CaixaKmz) => c.origem_identificacao ?? (origemNaoCadastrada(c) || null);

const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fotos da acomodação / DGO e das bandejas de cada caixa, como links longos (o Google Earth só aceita foto por link).
async function fotosParaKmz(cliente: SupabaseClient, caixas: CaixaKmz[]) {
  const porCaixa: Record<string, FotoKmz[]> = {};
  const ids = caixas.map((c) => c.id);
  const tipoDe = new Map(caixas.map((c) => [c.id, c.tipo]));
  for (let i = 0; i < ids.length; i += 100) {
    const { data: anexos } = await cliente.from("os_anexos").select("caminho_arquivo, tipo, caixa_id, bandeja")
      .in("caixa_id", ids.slice(i, i + 100)).in("tipo", ["foto_caixa", "foto_olt", "foto_bandeja"]).order("tipo").order("bandeja").order("criado_em");
    if (!anexos?.length) continue;
    const { data: urls } = await cliente.storage.from("os-anexos").createSignedUrls(anexos.map((a) => a.caminho_arquivo), VALIDADE_LINK_FOTO_KMZ);
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
export async function montarKmz(cliente: SupabaseClient, caixas: CaixaKmz[], rede: CaixaKmz[] = caixas): Promise<Uint8Array> {
  const fotos = await fotosParaKmz(cliente, caixas.filter((c) => c.latitude != null));
  const estilos = { emenda: "ff00a5ff", entroncamento: "ff0000ff", dgo: "ffff0000", site: "ff00b000" } as Record<string, string>;
  const pins = caixas.filter((c) => c.latitude != null).map((c) => {
    const linhas = [
      `${rotuloPonto(c.tipo, c.swap)}${rotuloInstalacao(c.instalacao) ? ` · ${rotuloInstalacao(c.instalacao)}` : ""} · O.S. ${c.os_numero}${c.trecho ? ` · ${c.trecho}` : ""}`,
      c.parceiro ? `Parceiro: ${c.parceiro}` : null,
      localDgo(c) || null,
      origemDe(c) ? `Vem de: ${origemDe(c)}${c.origem_saida ? ` (saída ${c.origem_saida})` : ""}` : null,
      `Entrada ${c.capacidade_fibras} FO → ${descreverSaidas(c) || "sem saída"}`,
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
${kmlLances(caixas)}
  </Document>
</kml>
`;
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  return zip.generateAsync({ type: "uint8array", mimeType: "application/vnd.google-earth.kmz" });
}
