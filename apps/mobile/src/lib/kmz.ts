import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import { Caixa } from './caixas';
import { itensPendentes } from './fila';
import { descreverFibra, faixasDaBandeja, FotoKmz, htmlFotosKmz, htmlPreviaPlano, rotuloInstalacao, rotuloPonto, separarBandejas } from './fusao';
import { supabase } from './supabase';
import { OrdemServico } from './tipos';

const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ESTILOS: Record<string, string> = { emenda: 'ff00a5ff', entroncamento: 'ff0000ff', dgo: 'ffff0000', site: 'ff00b000' };

// KML das caixas trabalhadas na O.S.: um pin por caixa / DGO / site com a TAG como nome e a prévia do plano de fusão
// (fibras, clientes/parceiros ativos) na descrição,
// mais a linha ligando as caixas na ordem em que foram registradas.
export function kmlDasCaixas(os: Pick<OrdemServico, 'numero' | 'titulo' | 'tipo'>, caixas: Caixa[], fotos: Record<string, FotoKmz[]> = {}) {
  const comLocal = caixas.filter((c) => c.latitude != null && c.longitude != null)
    .sort((a, b) => (a.localizada_em ?? '').localeCompare(b.localizada_em ?? ''));
  const pins = comLocal.map((c) => {
    const linhas = [
      `${rotuloPonto(c.tipo)}${rotuloInstalacao(c.instalacao) ? ` · ${rotuloInstalacao(c.instalacao)}` : ''} · O.S. ${os.numero}`,
      c.parceiro ? `Parceiro: ${c.parceiro}` : null,
      c.bastidor ? `Bastidor: ${c.bastidor}` : null,
      c.origem ? `Vem de: ${c.origem}${c.origem_saida ? ` (saída ${c.origem_saida})` : ''}` : null,
      `Entrada ${c.capacidade_fibras} FO → ${c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(', ') || 'sem saída'}`,
      ...(c.tipo === 'dgo' ? [] : separarBandejas(c)).map((b) => `Bandeja ${b.numero}: ${b.ligacoes.length} fusões (${faixasDaBandeja(b)})`),
      ...c.manobras.map((m) => `Manobra: ${descreverFibra(m.fibra_entrada, c.capacidade_fibras)} → Saída ${m.saida} FO ${m.fibra_saida}${m.motivo ? ` (${m.motivo})` : ''}`),
      c.endereco ? `Endereço: ${c.endereco}` : null,
      c.observacao ? `Obs.: ${c.observacao}` : null,
    ].filter(Boolean);
    return `      <Placemark>
        <name>${esc(c.identificacao)}</name>
        <styleUrl>#${c.tipo}</styleUrl>
        <description><![CDATA[${linhas.map(esc).join('<br>')}${htmlPreviaPlano(c)}${htmlFotosKmz(fotos[c.id] ?? [])}]]></description>
        <Point><coordinates>${c.longitude},${c.latitude},0</coordinates></Point>
      </Placemark>`;
  });
  const linha = comLocal.length > 1 ? `
    <Placemark>
      <name>Percurso das caixas · O.S. ${os.numero}</name>
      <Style><LineStyle><color>ff0060ff</color><width>3</width></LineStyle></Style>
      <LineString><tessellate>1</tessellate><coordinates>${comLocal.map((c) => `${c.longitude},${c.latitude},0`).join(' ')}</coordinates></LineString>
    </Placemark>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(`O.S. ${os.numero} · ${os.tipo} · ${os.titulo}`)}</name>
${Object.entries(ESTILOS).map(([id, cor]) => `    <Style id="${id}"><IconStyle><color>${cor}</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`).join('\n')}
    <Folder>
      <name>Caixas (${comLocal.length})</name>
${pins.join('\n')}
    </Folder>${linha}
  </Document>
</kml>
`;
}

const arquivoSeguro = (t: string) => t.replace(/[^A-Za-z0-9_-]+/g, '_');

// Fotos da acomodação da caixa e das bandejas, para irem dentro do KMZ: as que ainda estão no celular (fila)
// e, com internet, as que já subiram. Sem internet vão só as do celular.
async function fotosDasCaixas(osId: string, caixas: Caixa[], zip: JSZip) {
  const porCaixa: Record<string, FotoKmz[]> = {};
  const tag = new Map(caixas.map((c) => [c.id, c.identificacao]));
  const tipoDe = new Map(caixas.map((c) => [c.id, c.tipo]));
  const legenda = (caixaId: string, tipo: string, bandeja: number | null | undefined) =>
    tipo === 'foto_bandeja' ? `Bandeja ${bandeja ?? '?'} · fibras acomodadas` : tipoDe.get(caixaId) === 'dgo' ? 'DGO' : 'Acomodação da caixa';
  const incluir = (caixaId: string, tipo: string, bandeja: number | null | undefined, bytes: ArrayBuffer) => {
    const lista = (porCaixa[caixaId] ??= []);
    const nome = `files/${arquivoSeguro(tag.get(caixaId) ?? caixaId)}-${tipo === 'foto_bandeja' ? `B${bandeja ?? 0}` : 'caixa'}-${lista.length + 1}.jpg`;
    zip.file(nome, bytes);
    lista.push({ arquivo: nome, legenda: legenda(caixaId, tipo, bandeja) });
  };
  const ids = caixas.map((c) => c.id);
  try {
    const { data: anexos } = await supabase.from('os_anexos').select('caminho_arquivo, tipo, caixa_id, bandeja')
      .in('caixa_id', ids).in('tipo', ['foto_caixa', 'foto_bandeja']).order('tipo').order('bandeja').order('criado_em');
    if (anexos?.length) {
      const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(anexos.map((a) => a.caminho_arquivo), 600);
      const baixadas = await Promise.all((urls ?? []).map((u) => (u.signedUrl
        ? fetch(u.signedUrl).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null)));
      baixadas.forEach((b, i) => b && incluir(anexos[i].caixa_id, anexos[i].tipo, anexos[i].bandeja, b));
    }
  } catch {
    // sem internet: segue com as fotos do celular
  }
  for (const p of await itensPendentes()) {
    if (p.tipo !== 'foto' || p.osId !== osId || !p.caixaId || !ids.includes(p.caixaId)) continue;
    if (p.tipoAnexo !== 'foto_caixa' && p.tipoAnexo !== 'foto_bandeja') continue;
    try {
      incluir(p.caixaId, p.tipoAnexo, p.bandeja, await new File(p.arquivo).arrayBuffer());
    } catch {
      // arquivo não está mais no celular
    }
  }
  return porCaixa;
}

// Gera o KMZ no celular (funciona sem internet) e abre o compartilhamento do Android.
export async function compartilharKmz(os: Pick<OrdemServico, 'id' | 'numero' | 'titulo' | 'tipo'>, caixas: Caixa[]) {
  const zip = new JSZip();
  const fotos = await fotosDasCaixas(os.id, caixas, zip);
  zip.file('doc.kml', kmlDasCaixas(os, caixas, fotos));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const destino = new File(Paths.cache, `Caixas-OS-${os.numero}.kmz`);
  if (destino.exists) destino.delete();
  destino.create();
  await destino.write(bytes);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/vnd.google-earth.kmz', dialogTitle: `KMZ das caixas · O.S. ${os.numero}` });
}
