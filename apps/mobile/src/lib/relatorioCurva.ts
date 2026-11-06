import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { dataUrl } from './relatorioPdf';
import { Comparacao, deslocamentoParalelo, fimDaFibra, tracoParaComparar } from './comparaSor';
import { analisarSor, ehFibraAtiva, km, lerDbm, Nivel, rotuloOnda, Sor, textoPotencia, tracoJanela } from './sor';

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

export type Analista = { nome: string; cargo: string; empresa: string; registro: string; observacoes: string; tx?: string; rx?: string };

// Relatório em PDF da análise de uma curva OTDR, gerado no celular (funciona sem internet) e compartilhado.
export async function compartilharAnaliseCurva(s: Sor, nome: string, extensaoKm: number | null, trecho?: string | null,
  analista?: Analista | null, modo: 'completa' | 'otdr' = 'otdr') {
  const a = analisarSor(s, extensaoKm);
  const potencia = textoPotencia({ txDbm: lerDbm(analista?.tx ?? ''), rxDbm: lerDbm(analista?.rx ?? '') }, a.perdaTotalDb);
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
    body { font-family: sans-serif; font-size: 10.5pt; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    header img { height: 44px; } header .t { flex: 1; } header h1 { margin: 0; font-size: 16pt; }
    h2 { color: #0572CE; border-bottom: 2px solid #0572CE; font-size: 10pt; text-transform: uppercase; margin: 16px 0 6px; padding-bottom: 2px; }
    .s { color: #6b7280; } .l { color: #6b7280; font-size: 8.5pt; }
    .ind { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; } .ind div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; }
    .ind b { display: block; font-size: 13pt; } .alerta { background: #FDECEC; border-color: #F6C9C6 !important; color: #B42318; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; } td, th { padding: 4px 3px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { color: #6b7280; font-weight: normal; font-size: 8.5pt; } tr { break-inside: avoid; }
    .selo { border-radius: 10px; padding: 1px 7px; font-weight: bold; font-size: 8.5pt; white-space: nowrap; }
    .info { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; } .info div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 6px; }
    .info b { display: block; font-size: 10pt; }
    .rota { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 10px 14px; border-radius: 8px; background: #163A6B; color: #fff; }
    .rota > div { flex: 1; } .rota .l { color: #BFD3EE; display: block; } .rota b { font-size: 14pt; }
    .rota .seta { flex: 0 0 auto; text-align: center; font-size: 20pt; line-height: 1; } .rota .seta span { display: block; font-size: 8.5pt; color: #BFD3EE; }
    .det { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } figure { margin: 0; break-inside: avoid; } figcaption { font-size: 8.5pt; margin-bottom: 3px; }
  </style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div class="t"><h1>Análise de curva OTDR</h1>
    <div class="s">${esc(nome)}${trecho ? ` · Trecho ${esc(trecho)}` : ''}</div></div>
    <div class="s" style="text-align:right;font-size:9pt">Gerado em ${new Date().toLocaleString('pt-BR')}${analista?.nome || perfil?.nome ? `<br>por ${esc(analista?.nome || perfil?.nome)}` : ''}</div>
  </header>
  <h2>Resumo</h2>
  <div class="ind">
    <div class="${extensaoKm && a.comprimentoKm < extensaoKm * 0.97 ? 'alerta' : ''}"><span class="l">Fibra</span><b>${km(a.comprimentoKm)}</b>${extensaoKm ? `<span class="l">trecho ${km(extensaoKm)}</span>` : ''}</div>
    <div><span class="l">Perda total</span><b>${fmt(a.perdaTotalDb)} dB</b></div>
    <div><span class="l">Atenuação média</span><b>${a.atenuacaoMediaDbKm != null ? `${fmt(a.atenuacaoMediaDbKm, 3)} dB/km` : '—'}</b></div>
    <div><span class="l">ORL</span><b>${s.orlDb ? `${fmt(s.orlDb)} dB` : '—'}</b></div>
    <div class="${a.criticos ? 'alerta' : ''}"><span class="l">Eventos</span><b>${s.eventos.length}</b><span class="l">${a.criticos} crítico(s) · ${a.atencao} atenção</span></div>
  </div>
  ${s.localA || s.localB ? `<div class="rota"><div><span class="l">ORIGEM (A)</span><b>${esc(s.localA || '—')}</b></div>
    <div class="seta">→<span>${km(a.comprimentoKm)}</span></div><div style="text-align:right"><span class="l">FIM (B)</span><b>${esc(s.localB || '—')}</b></div></div>` : ''}
  <h2>Medição</h2>
  <div class="info">${[
    ['OTDR', [s.fabricante, s.equipamento].filter(Boolean).join(' ')], ['Comprimento de onda', rotuloOnda(s)],
    ['Pulso', `${s.pulsoNs} ns`], ['Índice de refração (IOR)', s.indiceRefracao.toFixed(4)], ['Resolução', `${fmt(s.resolucaoM)} m`],
    ['Cabo', s.cabo], ['Fibra', s.fibra], ['Medida em', s.data?.toLocaleString('pt-BR')], ['Série do OTDR', s.serie], ['Operador', s.operador],
  ].filter(([, v]) => v).map(([r, v]) => `<div><span class="l">${r}</span><b>${esc(v)}</b></div>`).join('')}</div>
  ${potencia ? `<div style="background:#EEF4FB;color:#163A6B;border-radius:6px;padding:6px 10px;margin:6px 0">${esc(potencia)}</div>` : ''}
  <h2>Curva</h2>
  ${svgTraco(s, niveis, 0, fimVista, 960, 300)}
  ${detalhes ? `<h2>Detalhe dos eventos que pedem ação</h2><div class="det">${detalhes}</div>` : ''}
  <h2>Eventos</h2>
  <p class="s" style="font-size:8.5pt;margin:0 0 4px">${modo === 'completa'
    ? `Curva lida por inteiro: ${s.eventos.filter((e) => e.detectado).length} evento(s) marcados como "lido da curva" foram encontrados na leitura do traço, além dos salvos pelo OTDR.`
    : 'Somente os eventos salvos pelo OTDR no arquivo.'}</p>
  <table><tr><th>#</th><th>Distância</th><th>Tipo</th><th>Perda</th><th>Reflectância</th><th>Lance</th><th>Situação</th><th>O que fazer</th></tr>
  ${a.diagnosticos.map((d) => `<tr><td>${d.evento.numero}</td><td style="white-space:nowrap"><b>${km(d.evento.distanciaKm)}</b></td><td>${esc(d.tipo)}${d.evento.detectado ? '<br><span class="l">lido da curva</span>' : ''}</td>
    <td style="white-space:nowrap">${fmt(d.evento.perdaDb, 3)} dB</td><td style="white-space:nowrap">${d.evento.reflectanciaDb ? `${fmt(d.evento.reflectanciaDb)} dB` : '—'}</td>
    <td style="white-space:nowrap">${d.evento.inclinacaoDbKm ? `${fmt(d.evento.inclinacaoDbKm, 3)} dB/km` : '—'}</td>
    <td><span class="selo" style="background:${COR[d.nivel]}1F;color:${COR[d.nivel]}">${ROTULO[d.nivel]}</span></td><td>${esc(d.texto)}</td></tr>`).join('')}
  </table>
  <p class="s" style="font-size:8pt">Limites usados: fusão até 0,30 dB; perda sem reflexão acima de 0,50 dB é crítica; conector até 0,75 dB; reflexão acima de -35 dB;
    lance acima de ${s.comprimentoOndaNm >= 1500 ? '0,30' : '0,45'} dB/km. A distância é a da fibra (inclui sobras técnicas), não a do mapa.${ehFibraAtiva(s) ? ' Medição em ' + s.comprimentoOndaNm + ' nm: feita com a fibra ativa (em tráfego), com filtro no OTDR.' : ''}</p>
  ${analista && (analista.nome || analista.observacoes) ? `<h2>Responsável pela análise</h2>
  ${analista.observacoes ? `<p style="white-space:pre-wrap;margin:0 0 10px"><b>Parecer:</b> ${esc(analista.observacoes)}</p>` : ''}
  <div style="display:flex;gap:24px;align-items:flex-end;break-inside:avoid">
    <div style="flex:1"><div class="info" style="grid-template-columns:repeat(4,1fr)">${[
      ['Analista', analista.nome], ['Cargo / função', analista.cargo], ['Empresa', analista.empresa], ['Registro', analista.registro],
    ].filter(([, v]) => v).map(([r, v]) => `<div><span class="l">${r}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
    <div style="width:220px;text-align:center"><div style="border-top:1px solid #333;padding-top:3px;font-size:8.5pt">Assinatura</div></div>
  </div>` : ''}
  <p class="s" style="font-size:8pt;margin-top:12px;border-top:1px solid #ccc;padding-top:4px">Multivale Engenharia · Backbone · gerado pelo Técnico Plus</p>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  // O PDF leva o mesmo nome do arquivo .sor (só tira caracteres que o Android não aceita em nome de arquivo).
  const base = nome.replace(/\.sor$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120) || 'curva';
  const destino = new File(Paths.cache, `${base}.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', dialogTitle: 'Análise da curva OTDR', UTI: 'com.adobe.pdf' });
}

// PDF do comparativo de duas curvas (A → B × B → A, antes × depois ou duas fibras do mesmo cabo), gerado no celular.
export async function compartilharComparativo(c: Comparacao, s1: Sor, s2: Sor,
  o: { nomes: string[]; curva1: string; curva2: string; fibra: string; modo: 'completa' | 'otdr'; potencias?: string[] }) {
  const bi = c.tipo === 'bidirecional', fb = c.tipo === 'fibras';
  const analista = await AsyncStorage.getItem('analista-curva').then((t) => (t ? JSON.parse(t) as Partial<Analista> : null)).catch(() => null);
  const logo = await Asset.fromModule(require('../../assets/mascara/logo-multivale.png')).downloadAsync()
    .then((x) => (x.localUri ? dataUrl(x.localUri) : null)).catch(() => null);
  const t1 = tracoParaComparar(s1), t2b = tracoParaComparar(s2, bi ? { comprimentoKm: fimDaFibra(s1) } : undefined);
  // Mesmo sentido: a 2ª curva corre em paralelo, alguns dB abaixo, para não sobrepor.
  const desloc = bi ? 0 : deslocamentoParalelo(t1, t2b);
  const t2 = t2b.map((p) => ({ km: p.km, db: p.db + desloc }));
  const dbEm = (t: { km: number; db: number }[], k: number) => (t.reduce((a, p) => (Math.abs(p.km - k) < Math.abs(a.km - k) ? p : a), t[0]) ?? { db: 0 }).db;
  const todos = [...t1, ...t2];
  const Lg = 960, Ag = 300, m = { e: 44, d: 10, t: 24, b: 22 };
  const maxKm = Math.max(...todos.map((p) => p.km), 1);
  const dbs = todos.map((p) => p.db).sort((a, b) => a - b);
  const minDb = dbs[Math.floor(dbs.length * 0.02)] ?? -1, maxDb = Math.max(1, dbs[Math.floor(dbs.length * 0.995)] ?? 1);
  const x = (k: number) => m.e + (k / maxKm) * (Lg - m.e - m.d);
  const y = (d: number) => m.t + ((maxDb - Math.min(maxDb, Math.max(minDb, d))) / (maxDb - minDb || 1)) * (Ag - m.t - m.b);
  const cam = (t: { km: number; db: number }[]) => t.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join('');
  const pk = passoEixo(maxKm, 10);
  const svg = `<svg viewBox="0 0 ${Lg} ${Ag}" width="100%" style="background:#F8FAFC;border:1px solid #e5e7eb;border-radius:6px">
    ${Array.from({ length: Math.floor(maxKm / pk) + 1 }, (_, i) => i * pk).map((k) => `<line x1="${x(k)}" x2="${x(k)}" y1="${m.t}" y2="${Ag - m.b}" stroke="#E4E7EC"/><text x="${x(k)}" y="${Ag - 6}" font-size="10" fill="#667085" text-anchor="middle">${rotuloKm(k)}</text>`).join('')}
    <path d="${cam(t1)}" fill="none" stroke="#163A6B" stroke-width="1.3"/><path d="${cam(t2)}" fill="none" stroke="#E07B00" stroke-width="1.3"/>
    ${c.linhas.map((l, i) => `${l.perda1 != null ? `<circle cx="${x(l.km)}" cy="${y(dbEm(t1, l.km))}" r="3.5" fill="#fff" stroke="#163A6B" stroke-width="1.6"/>` : ''}
      ${l.perda2 != null ? `<circle cx="${x(l.km)}" cy="${y(dbEm(t2, l.km))}" r="3.5" fill="#fff" stroke="#E07B00" stroke-width="1.6"/>` : ''}
      ${l.nivel === 'ok' ? '' : `<line x1="${x(l.km)}" x2="${x(l.km)}" y1="${m.t}" y2="${Ag - m.b}" stroke="${COR[l.nivel]}" stroke-dasharray="4 3"/>
      <circle cx="${x(l.km)}" cy="${m.t - 12}" r="9" fill="${COR[l.nivel]}"/><text x="${x(l.km)}" y="${m.t - 8}" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>`}`).join('')}
  </svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; } body { font-family: sans-serif; font-size: 10.5pt; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; } header img { height: 44px; } header h1 { margin: 0; font-size: 16pt; }
    h2 { color: #0572CE; border-bottom: 2px solid #0572CE; font-size: 10pt; text-transform: uppercase; margin: 16px 0 6px; padding-bottom: 2px; }
    .s { color: #6b7280; } .l { color: #6b7280; font-size: 8.5pt; display: block; }
    .ind { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .ind div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; } .ind b { display: block; font-size: 13pt; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; } td, th { padding: 4px 3px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { color: #6b7280; font-weight: normal; font-size: 8.5pt; } tr { break-inside: avoid; } .selo { border-radius: 10px; padding: 1px 7px; font-weight: bold; font-size: 8.5pt; white-space: nowrap; }
    .aviso { border-radius: 6px; padding: 6px 10px; margin: 4px 0; }
  </style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div style="flex:1"><h1>Comparativo de curvas OTDR</h1>
    <div class="s">${bi ? 'Bidirecional (A → B × B → A)' : fb ? `Duas fibras do mesmo cabo (${esc(o.nomes[0])} × ${esc(o.nomes[1])})` : 'Antes × depois'}${o.fibra ? ` · Fibra ${esc(o.fibra)}` : ''}</div></div>
    <div class="s" style="text-align:right;font-size:9pt">Gerado em ${new Date().toLocaleString('pt-BR')}${analista?.nome ? `<br>por ${esc(analista.nome)}` : ''}</div></header>
  <p class="s"><b style="color:#163A6B">■ ${o.nomes[0]}</b>: ${esc(o.curva1)} (${rotuloOnda(s1)}) &nbsp; <b style="color:#E07B00">■ ${o.nomes[1]}</b>: ${esc(o.curva2)} (${rotuloOnda(s2)}) · ${o.modo === 'completa' ? 'curva lida por inteiro' : 'somente eventos do OTDR'}</p>
  <div class="ind">
    <div><span class="l">Comprimento ${o.nomes[0]}</span><b>${km(c.comprimento1Km)}</b></div><div><span class="l">Comprimento ${o.nomes[1]}</span><b>${km(c.comprimento2Km)}</b></div>
    <div><span class="l">Perda total ${o.nomes[0]}</span><b>${fmt(c.perdaTotal1Db)} dB</b></div>
    <div><span class="l">Perda total ${o.nomes[1]}</span><b>${fmt(c.perdaTotal2Db)} dB</b><span class="l">${bi ? `média ${fmt((c.perdaTotal1Db + c.perdaTotal2Db) / 2)} dB` : fb ? `diferença ${fmt(Math.abs(c.perdaTotal2Db - c.perdaTotal1Db))} dB` : `diferença ${fmt(c.perdaTotal2Db - c.perdaTotal1Db)} dB`}</span></div>
  </div>
  ${(o.potencias ?? []).map((t, i) => (t ? `<div class="aviso" style="background:#EEF4FB;color:#163A6B"><b>${esc(o.nomes[i])}</b> · ${esc(t)}</div>` : '')).join('')}
  ${c.avisos.map((a) => `<div class="aviso" style="background:${COR[a.nivel]}1A;color:${a.nivel === 'ok' ? '#14532d' : COR[a.nivel]}">${esc(a.texto)}</div>`).join('')}
  <h2>Curvas sobrepostas</h2>${svg}
  <p class="l">dB relativos ao início de cada medição${bi ? '; B → A espelhada (OTDR no lado B, à direita)' : `; ${esc(o.nomes[1])} em paralelo, ${desloc} dB abaixo`}. ○ ponto em cada curva onde o evento aparece; número só nos eventos que pedem atenção.</p>
  <h2>Eventos</h2>
  <table><tr><th>#</th><th>Distância (de A)</th><th>${o.nomes[0]}</th><th>${o.nomes[1]}</th><th>${bi ? 'Média (perda real)' : fb ? 'Perda comum' : 'Diferença'}</th><th>Situação</th><th>O que fazer</th></tr>
  ${c.linhas.map((l, i) => `<tr><td>${i + 1}</td><td style="white-space:nowrap"><b>${km(l.km)}</b>${l.reflexivo ? '<span class="l">reflexivo</span>' : ''}</td>
    <td>${l.perda1 == null ? '—' : `${fmt(l.perda1, 3)} dB`}</td><td>${l.perda2 == null ? '—' : `${fmt(l.perda2, 3)} dB`}</td>
    <td><b>${l.resultado == null ? '—' : `${c.tipo === 'antesDepois' && l.resultado > 0 ? '+' : ''}${fmt(l.resultado, 3)} dB`}</b></td>
    <td><span class="selo" style="background:${COR[l.nivel]}1F;color:${COR[l.nivel]}">${esc(l.situacao)}</span></td><td>${esc(l.texto)}</td></tr>`).join('')}
  </table>
  <p class="s" style="font-size:8pt">${bi ? 'A perda real de cada emenda é a média dos dois sentidos. As distâncias do B → A foram espelhadas para contar a partir de A.' : fb ? 'Perda comum = a menor perda das duas fibras no mesmo ponto. Acima de 0,15 dB nas duas é esforço no cabo (torção, esmagamento, curvatura, ferragem apertada) ou acomodação ruim na caixa; perda alta só numa fibra é fusão/acomodação daquela fibra.' : 'Diferença = perda depois − perda antes. Piorou acima de 0,10 dB; acima de 0,30 dB é crítico.'}</p>
  ${analista?.nome ? `<div style="display:flex;gap:24px;align-items:flex-end;margin-top:16px;break-inside:avoid">${[
    ['Analista', analista.nome], ['Cargo / função', analista.cargo], ['Empresa', analista.empresa], ['Registro', analista.registro],
  ].filter(([, v]) => v).map(([r, v]) => `<div><span class="l">${r}</span><b>${esc(v)}</b></div>`).join('')}
    <div style="margin-left:auto;width:220px;text-align:center;border-top:1px solid #333;padding-top:3px;font-size:8.5pt">Assinatura</div></div>` : ''}
  <p class="s" style="font-size:8pt;margin-top:12px;border-top:1px solid #ccc;padding-top:4px">Multivale Engenharia · Backbone · gerado pelo Técnico Plus</p>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  const destino = new File(Paths.cache, `comparativo${o.fibra ? `-fibra-${o.fibra.replace(/[\\/:*?"<>|]+/g, '_')}` : ''}.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', dialogTitle: 'Comparativo de curvas OTDR', UTI: 'com.adobe.pdf' });
}
