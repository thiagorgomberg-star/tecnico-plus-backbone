import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import { Caixa } from './caixas';
import { descreverFibra, faixasDaBandeja, rotuloPonto, separarBandejas } from './fusao';
import { OrdemServico } from './tipos';

const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ESTILOS: Record<string, string> = { emenda: 'ff00a5ff', entroncamento: 'ff0000ff', dgo: 'ffff0000' };

// KML das caixas trabalhadas na O.S.: um pin por caixa com a TAG como nome e o plano de fusão na descrição,
// mais a linha ligando as caixas na ordem em que foram registradas.
export function kmlDasCaixas(os: Pick<OrdemServico, 'numero' | 'titulo' | 'tipo'>, caixas: Caixa[]) {
  const comLocal = caixas.filter((c) => c.latitude != null && c.longitude != null)
    .sort((a, b) => (a.localizada_em ?? '').localeCompare(b.localizada_em ?? ''));
  const pins = comLocal.map((c) => {
    const linhas = [
      `${rotuloPonto(c.tipo)} · O.S. ${os.numero}`,
      c.origem ? `Vem de: ${c.origem}${c.origem_saida ? ` (saída ${c.origem_saida})` : ''}` : null,
      `Entrada ${c.capacidade_fibras} FO → ${c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(', ') || 'sem saída'}`,
      ...separarBandejas(c).map((b) => `Bandeja ${b.numero}: ${b.ligacoes.length} fusões (${faixasDaBandeja(b)})`),
      ...c.manobras.map((m) => `Manobra: ${descreverFibra(m.fibra_entrada, c.capacidade_fibras)} → Saída ${m.saida} FO ${m.fibra_saida}${m.motivo ? ` (${m.motivo})` : ''}`),
      ...c.fibras.map((f) => `Fibra ${f.fibra}: ${[f.cliente, f.sem_potencia ? 'SEM POTÊNCIA' : null,
        f.potencia_dbm != null ? `${f.potencia_dbm} dBm` : null].filter(Boolean).join(' · ')}`),
      c.endereco ? `Endereço: ${c.endereco}` : null,
      c.observacao ? `Obs.: ${c.observacao}` : null,
    ].filter(Boolean);
    return `      <Placemark>
        <name>${esc(c.identificacao)}</name>
        <styleUrl>#${c.tipo}</styleUrl>
        <description><![CDATA[${linhas.map(esc).join('<br>')}]]></description>
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

// Gera o KMZ no celular (funciona sem internet) e abre o compartilhamento do Android.
export async function compartilharKmz(os: Pick<OrdemServico, 'numero' | 'titulo' | 'tipo'>, caixas: Caixa[]) {
  const zip = new JSZip();
  zip.file('doc.kml', kmlDasCaixas(os, caixas));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const destino = new File(Paths.cache, `Caixas-OS-${os.numero}.kmz`);
  if (destino.exists) destino.delete();
  destino.create();
  await destino.write(bytes);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/vnd.google-earth.kmz', dialogTitle: `KMZ das caixas · O.S. ${os.numero}` });
}
