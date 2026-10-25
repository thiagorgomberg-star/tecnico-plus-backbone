import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { dataUrl } from './relatorioPdf';
import { analisarSor, km, Nivel, Sor, tracoJanela } from './sor';

const COR: Record<Nivel, string> = { ok: '#1E9E4A', atencao: '#D99A00', critico: '#D0453B' };
const ROTULO: Record<Nivel, string> = { ok: 'OK', atencao: 'Atenção', critico: 'Crítico' };
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const passoEixo = (span: number, alvo: number) => [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find((v) => span / v <= alvo) ?? 200;
const rotuloKm = (k: number) => (Math.abs(k) < 1 && k !== 0 ? `${Math.round(k * 1000)} m` : `${Number(k.toFixed(2)).toLocaleString('pt-BR')} km`);

// Traço em SVG entre dois pontos (km), com os eventos marcados na cor da situação.
function svgTraco(s: Sor, niveis: Nivel[], ini: number, fim: number, L: number, A: number, destaque?: number) {
  const m = { e: 40, d: 10, t: 24, b: 22 };
  const pontos = tracoJanela(s, ini, fim, 900);
  if (!pontos.length) return '';
  const dbs = pontos.map((p) => p.db);
  const maxDb = Math.max(...dbs), minDb = Math.min(...dbs);
  const folga = (maxDb - minDb) * 0.06 || 0.5;
  const topo = maxDb + folga, base = minDb - folga;
  const x = (k: number) => m.e + ((k - ini) / (fim - ini)) * (L - m.e - m.d);
  const y = (d: number) => m.t + ((topo - d) / (topo - base)) * (A - m.t - m.b);
  const pk = passoEixo(fim - ini, 6), pd = passoEixo(topo - base, 5);
  const mk = Array.from({ length: Math.floor((fim - ini) / pk) + 2 }, (_, i) => Math.ceil(ini / pk) * pk + i * pk).filter((k) => k <= fim);
  const md = Array.from({ length: Math.floor((topo - base) / pd) + 2 }, (_, i) => Math.ceil(base / pd) * pd + i * pd).filter((d) => d <= topo);
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join('');
  const eventos = s.eventos.map((e, i) => ({ e, i })).filter(({ e }) => e.distanciaKm >= ini && e.distanciaKm <= fim);
  return `<svg viewBox="0 0 ${L} ${A}" width="100%" style="background:#F8FAFC;border:1px solid #e5e7eb;border-radius:6px">
    ${mk.map((k) => `<line x1="${x(k)}" x2="${x(k)}" y1="${m.t}" y2="${A - m.b}" stroke="#E4E7EC"/><text x="${x(k)}" y="${A - 6}" font-size="10" fill="#667085" text-anchor="middle">${rotuloKm(k)}</text>`).join('')}
    ${md.map((d) => `<line x1="${m.e}" x2="${L - m.d}" y1="${y(d)}" y2="${y(d)}" stroke="#EEF0F3"/><text x="${m.e - 5}" y="${y(d) + 3}" font-size="10" fill="#667085" text-anchor="end">${Number(d.toFixed(2))}</text>`).join('')}
    <path d="${caminho}" fill="none" stroke="#163A6B" stroke-width="1.3"/>
    ${eventos.map(({ e, i }) => `<line x1="${x(e.distanciaKm)}" x2="${x(e.distanciaKm)}" y1="${m.t}" y2="${A - m.b}" stroke="${COR[niveis[i]]}" stroke-width="${i === destaque ? 2.5 : 1.2}" ${i === destaque ? '' : 'stroke-dasharray="4 3"'}/>
      <circle cx="${x(e.distanciaKm)}" cy="${m.t - 12}" r="9" fill="${COR[niveis[i]]}"/><text x="${x(e.distanciaKm)}" y="${m.t - 8}" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${e.numero}</text>`).join('')}
  </svg>`;
}

// Relatório em PDF da análise de uma curva OTDR, gerado no celular (funciona sem internet) e compartilhado.
export async function compartilharAnaliseCurva(s: Sor, nome: string, extensaoKm: number | null, trecho?: string | null) {
  const a = analisarSor(s, extensaoKm);
  const niveis = a.diagnosticos.map((d) => d.nivel);
  const total = Math.max(s.traco.at(-1)?.km ?? 0, ...s.eventos.map((e) => e.distanciaKm)) || 1;
  const fimFibra = s.eventos.find((e) => e.fimDeFibra)?.distanciaKm ?? total;
  const fimVista = Math.min(total, Math.max(fimFibra * 1.08, fimFibra + 0.2));
  const perfil = await AsyncStorage.getItem('meu-perfil').then((t) => (t ? JSON.parse(t) as { nome?: string; cargo?: string } : null)).catch(() => null);
  const logo = await Asset.fromModule(require('../../assets/mascara/logo-multivale.png')).downloadAsync()
    .then((x) => (x.localUri ? dataUrl(x.localUri) : null)).catch(() => null);

  // Detalhe (zoom) de cada evento que pede ação.
  const meia = Math.max(0.3, (s.resolucaoM / 1000) * 60);
  const detalhes = a.diagnosticos.map((d, i) => ({ d, i })).filter(({ d }) => d.nivel !== 'ok').map(({ d, i }) => {
    const ini = Math.min(Math.max(d.evento.distanciaKm - meia, 0), Math.max(total - 2 * meia, 0));
    return `<figure><figcaption><b style="color:${COR[d.nivel]}">Evento ${d.evento.numero} · ${km(d.evento.distanciaKm)} · ${ROTULO[d.nivel]}</b><br>${esc(d.texto)}</figcaption>
      ${svgTraco(s, niveis, ini, Math.min(total, ini + 2 * meia), 480, 200, i)}</figure>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: sans-serif; font-size: 10.5pt; color: #1f2937; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    header img { height: 44px; } header .t { flex: 1; } header h1 { margin: 0; font-size: 16pt; }
    h2 { color: #0572CE; border-bottom: 2px solid #0572CE; font-size: 10pt; text-transform: uppercase; margin: 16px 0 6px; padding-bottom: 2px; }
    .s { color: #6b7280; } .l { color: #6b7280; font-size: 8.5pt; }
    .ind { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; } .ind div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; }
    .ind b { display: block; font-size: 13pt; } .alerta { background: #FDECEC; border-color: #F6C9C6 !important; color: #B42318; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; } td, th { padding: 4px 3px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { color: #6b7280; font-weight: normal; font-size: 8.5pt; } tr { break-inside: avoid; }
    .selo { border-radius: 10px; padding: 1px 7px; font-weight: bold; font-size: 8.5pt; white-space: nowrap; }
    .det { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } figure { margin: 0; break-inside: avoid; } figcaption { font-size: 8.5pt; margin-bottom: 3px; }
  </style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div class="t"><h1>Análise de curva OTDR</h1>
    <div class="s">${esc(nome)}${trecho ? ` · Trecho ${esc(trecho)}` : ''}</div></div>
    <div class="s" style="text-align:right;font-size:9pt">Gerado em ${new Date().toLocaleString('pt-BR')}${perfil?.nome ? `<br>por ${esc(perfil.nome)}` : ''}</div>
  </header>
  <h2>Resumo</h2>
  <div class="ind">
    <div class="${extensaoKm && a.comprimentoKm < extensaoKm * 0.97 ? 'alerta' : ''}"><span class="l">Fibra</span><b>${km(a.comprimentoKm)}</b>${extensaoKm ? `<span class="l">trecho ${km(extensaoKm)}</span>` : ''}</div>
    <div><span class="l">Perda total</span><b>${fmt(a.perdaTotalDb)} dB</b></div>
    <div><span class="l">Atenuação média</span><b>${a.atenuacaoMediaDbKm != null ? `${fmt(a.atenuacaoMediaDbKm, 3)} dB/km` : '—'}</b></div>
    <div><span class="l">ORL</span><b>${s.orlDb ? `${fmt(s.orlDb)} dB` : '—'}</b></div>
    <div class="${a.criticos ? 'alerta' : ''}"><span class="l">Eventos</span><b>${s.eventos.length}</b><span class="l">${a.criticos} crítico(s) · ${a.atencao} atenção</span></div>
  </div>
  <p class="s" style="font-size:9pt">${esc([s.fabricante, s.equipamento].filter(Boolean).join(' '))} · ${s.comprimentoOndaNm} nm · pulso ${s.pulsoNs} ns · IOR ${s.indiceRefracao.toFixed(4)} · resolução ${fmt(s.resolucaoM)} m
    ${s.cabo ? ` · cabo ${esc(s.cabo)}` : ''}${s.fibra ? ` · fibra ${esc(s.fibra)}` : ''}${s.localA || s.localB ? ` · ${esc(s.localA || '?')} → ${esc(s.localB || '?')}` : ''}${s.data ? ` · medida em ${s.data.toLocaleString('pt-BR')}` : ''}</p>
  <h2>Curva</h2>
  ${svgTraco(s, niveis, 0, fimVista, 960, 300)}
  ${detalhes ? `<h2>Detalhe dos eventos que pedem ação</h2><div class="det">${detalhes}</div>` : ''}
  <h2>Eventos</h2>
  <table><tr><th>#</th><th>Distância</th><th>Tipo</th><th>Perda</th><th>Reflectância</th><th>Lance</th><th>Situação</th><th>O que fazer</th></tr>
  ${a.diagnosticos.map((d) => `<tr><td>${d.evento.numero}</td><td style="white-space:nowrap"><b>${km(d.evento.distanciaKm)}</b></td><td>${esc(d.tipo)}</td>
    <td style="white-space:nowrap">${fmt(d.evento.perdaDb, 3)} dB</td><td style="white-space:nowrap">${d.evento.reflectanciaDb ? `${fmt(d.evento.reflectanciaDb)} dB` : '—'}</td>
    <td style="white-space:nowrap">${d.evento.inclinacaoDbKm ? `${fmt(d.evento.inclinacaoDbKm, 3)} dB/km` : '—'}</td>
    <td><span class="selo" style="background:${COR[d.nivel]}1F;color:${COR[d.nivel]}">${ROTULO[d.nivel]}</span></td><td>${esc(d.texto)}</td></tr>`).join('')}
  </table>
  <p class="s" style="font-size:8pt">Limites usados: fusão até 0,30 dB; perda sem reflexão acima de 0,50 dB é crítica; conector até 0,75 dB; reflexão acima de -35 dB;
    lance acima de ${s.comprimentoOndaNm >= 1500 ? '0,30' : '0,45'} dB/km. A distância é a da fibra (inclui sobras técnicas), não a do mapa.</p>
  <p class="s" style="font-size:8pt;margin-top:12px;border-top:1px solid #ccc;padding-top:4px">Multivale Engenharia · Backbone · gerado pelo Técnico Plus</p>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  const base = nome.replace(/\.sor$/i, '').normalize('NFD').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'curva';
  const destino = new File(Paths.cache, `Analise-OTDR-${base}.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', dialogTitle: 'Análise da curva OTDR', UTI: 'com.adobe.pdf' });
}
