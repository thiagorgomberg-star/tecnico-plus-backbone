// Traçado da rota a partir do KMZ/KML (mesmo arquivo no app e no painel): as linhas do cabo viram um caminho
// único e o local do rompimento é posto sobre ele, em vez da linha reta entre as caixas.
import JSZip from 'jszip';

import { CaixaRede, descontarReservas, distanciaMetros, LanceCabo, MarcaNoCaminho, refinarPorMarcas, ReservasAvulsas, Rompimento } from './fusao';

export type Coord = { lat: number; lng: number };
export type PontoKml = Coord & { nome: string };
// nomesLinhas: nome de cada linha com as pastas do KMZ ("Pasta / Subpasta / Nome"), para escolher o trecho num KMZ geral.
export type Tracado = { linhas: Coord[][]; pontos: PontoKml[]; nomesLinhas?: string[] };

const entidades = (t: string) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const coords = (t: string): Coord[] => t.trim().split(/\s+/).map((c) => c.split(',').map(Number))
  .filter((v) => v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])).map(([lng, lat]) => ({ lat, lng }));

export function lerKml(texto: string): Tracado {
  const linhas: Coord[][] = [];
  const nomesLinhas: string[] = [];
  const pontos: PontoKml[] = [];
  const pastas: string[] = [];
  for (const m of texto.matchAll(/<Folder[\s>]|<\/Folder>|<Placemark[\s>][\s\S]*?<\/Placemark>/g)) {
    const p = m[0];
    if (p.startsWith('<Folder')) {
      const depois = texto.slice(m.index! + p.length, m.index! + p.length + 400);
      pastas.push(entidades(depois.match(/^\s*(?:<[^>]*>\s*)*?<name>([\s\S]*?)<\/name>/)?.[1] ?? ''));
      continue;
    }
    if (p === '</Folder>') { pastas.pop(); continue; }
    const nome = entidades(p.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '');
    for (const l of p.matchAll(/<LineString[\s>][\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const c = coords(l[1]);
      if (c.length >= 2) { linhas.push(c); nomesLinhas.push([...pastas.filter(Boolean), nome || 'Linha sem nome'].join(' / ')); }
    }
    const pt = p.match(/<Point[\s>][\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
    if (pt) { const c = coords(pt[1])[0]; if (c) pontos.push({ ...c, nome }); }
  }
  // gx:Track / coordenadas soltas de outros formatos ficam de fora: o traçado do backbone vem em LineString.
  return { linhas, pontos, nomesLinhas };
}

function utf8(b: Uint8Array) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(b);
  let bin = '';
  for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
  try { return decodeURIComponent(escape(bin)); } catch { return bin; }
}

// KMZ é um zip com um .kml dentro (normalmente doc.kml); aceita também o .kml direto.
export async function lerKmz(bytes: Uint8Array): Promise<Tracado> {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!zip) return lerKml(utf8(bytes));
  const arq = await JSZip.loadAsync(bytes);
  const kmls = Object.values(arq.files).filter((f) => !f.dir && /\.kml$/i.test(f.name));
  const doc = kmls.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ?? kmls[0];
  if (!doc) throw new Error('O KMZ não tem um arquivo .kml dentro');
  const t = lerKml(await doc.async('string'));
  for (const outro of kmls.filter((f) => f !== doc)) {
    const x = lerKml(await outro.async('string'));
    t.linhas.push(...x.linhas);
    t.nomesLinhas?.push(...(x.nomesLinhas ?? []));
    t.pontos.push(...x.pontos);
  }
  return t;
}

export const comprimento = (l: Coord[]) => l.slice(1).reduce((s, p, i) => s + distanciaMetros(l[i], p), 0);

// Junta os pedaços de linha num caminho só, ligando sempre a ponta mais próxima (o KMZ costuma vir em trechos).
export function encadear(linhas: Coord[][]): Coord[] {
  if (!linhas.length) return [];
  const resto = linhas.map((l) => [...l]);
  resto.sort((a, b) => comprimento(b) - comprimento(a));
  let cam = resto.shift()!;
  while (resto.length) {
    let melhor = { i: -1, d: Infinity, inverter: false, noInicio: false };
    resto.forEach((l, i) => {
      const op = [
        { d: distanciaMetros(cam[cam.length - 1], l[0]), inverter: false, noInicio: false },
        { d: distanciaMetros(cam[cam.length - 1], l[l.length - 1]), inverter: true, noInicio: false },
        { d: distanciaMetros(cam[0], l[l.length - 1]), inverter: false, noInicio: true },
        { d: distanciaMetros(cam[0], l[0]), inverter: true, noInicio: true },
      ];
      for (const o of op) if (o.d < melhor.d) melhor = { i, ...o };
    });
    const [l] = resto.splice(melhor.i, 1);
    const peca = melhor.inverter ? [...l].reverse() : l;
    cam = melhor.noInicio ? [...peca, ...cam] : [...cam, ...peca];
  }
  return cam;
}

// Posição (metros desde o começo do caminho) do ponto do traçado mais perto de p, e a distância até ele.
export function projetar(cam: Coord[], p: Coord) {
  let melhor = { s: 0, dist: Infinity };
  let acum = 0;
  const kx = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i < cam.length - 1; i++) {
    const a = cam[i], b = cam[i + 1];
    const seg = distanciaMetros(a, b);
    const dx = (b.lng - a.lng) * kx, dy = b.lat - a.lat;
    const t = dx || dy ? Math.min(1, Math.max(0, (((p.lng - a.lng) * kx) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy))) : 0;
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = distanciaMetros(p, q);
    if (d < melhor.dist) melhor = { s: acum + seg * t, dist: d };
    acum += seg;
  }
  return melhor;
}

export function pontoEm(cam: Coord[], s: number): Coord {
  let acum = 0;
  for (let i = 0; i < cam.length - 1; i++) {
    const seg = distanciaMetros(cam[i], cam[i + 1]);
    if (s <= acum + seg || i === cam.length - 2) {
      const t = seg ? Math.min(1, Math.max(0, (s - acum) / seg)) : 0;
      return { lat: cam[i].lat + (cam[i + 1].lat - cam[i].lat) * t, lng: cam[i].lng + (cam[i + 1].lng - cam[i].lng) * t };
    }
    acum += seg;
  }
  return cam[0];
}

// Pedaço do caminho entre duas posições (para desenhar no KML o trajeto da medição até o rompimento).
export function trechoEntre(cam: Coord[], s1: number, s2: number): Coord[] {
  const [a, b] = s1 <= s2 ? [s1, s2] : [s2, s1];
  const out: Coord[] = [pontoEm(cam, a)];
  let acum = 0;
  for (let i = 0; i < cam.length - 1; i++) {
    acum += distanciaMetros(cam[i], cam[i + 1]);
    if (acum > a && acum < b) out.push(cam[i + 1]);
  }
  out.push(pontoEm(cam, b));
  return s1 <= s2 ? out : out.reverse();
}

const temLocal = (c: { latitude?: number | null; longitude?: number | null }) => c.latitude != null && c.longitude != null;
const local = (c: { latitude?: number | null; longitude?: number | null }) => ({ lat: c.latitude!, lng: c.longitude! });
// Caixas a mais de 300 m do traçado provavelmente são de outra rota: aí o traçado não é usado.
const LONGE_M = 300;

export type NoTracado = { lat: number; lng: number; sRompimento: number; sMedicao: number | null; afastamento: number };

// Põe o rompimento sobre o traçado. Num lance: a fração do cabo percorrida (sem o cabo das reservas) vira a mesma
// fração do traçado entre as duas caixas. Depois da última caixa mapeada: segue o traçado pelos metros que faltam.
export function rompimentoNoTracado(r: Rompimento, lances: LanceCabo[], cam: Coord[], medicao: { latitude?: number | null; longitude?: number | null }): NoTracado | null {
  if (cam.length < 2 || r.tipo === 'sem_medida') return null;
  const sMed = temLocal(medicao) ? projetar(cam, local(medicao)) : null;
  const sMedicao = sMed && sMed.dist <= LONGE_M ? sMed.s : null;
  const pronto = (s: number, afastamento: number): NoTracado => ({ ...pontoEm(cam, s), sRompimento: s, sMedicao, afastamento });

  if (r.tipo === 'lance') {
    const l = r.lance;
    if (!temLocal(l.de) || !temLocal(l.para) || l.metros == null) return null;
    const pa = projetar(cam, local(l.de)), pb = projetar(cam, local(l.para));
    if (pa.dist > LONGE_M || pb.dist > LONGE_M) return null;
    const enroladas = l.reservas.reduce((s, x) => s + x.metros, 0);
    const antes = l.reservas.filter((x) => x.pos + x.metros <= r.metrosDoInicio).reduce((s, x) => s + x.metros, 0);
    const chao = Math.max(l.metros - enroladas, 1);
    const f = Math.min(1, Math.max(0, (r.metrosDoInicio - antes) / chao));
    return pronto(pa.s + (pb.s - pa.s) * f, Math.max(pa.dist, pb.dist));
  }
  if (r.tipo === 'alem') {
    const ult = r.ultima;
    if (!temLocal(ult)) return null;
    const pu = projetar(cam, local(ult));
    if (pu.dist > LONGE_M) return null;
    // Sentido: o mesmo do último lance (de quem veio para a última caixa); sem lance, para longe da medição.
    const ant = lances.length ? lances[lances.length - 1].de : null;
    const ref = ant && temLocal(ant) ? projetar(cam, local(ant)).s : sMedicao;
    const dir = ref == null ? 1 : Math.sign(pu.s - ref) || 1;
    const total = comprimento(cam);
    const s = Math.min(total, Math.max(0, pu.s + dir * r.metrosDepois));
    return pronto(s, pu.dist);
  }
  // Reservas: o ponto já é o da caixa/reserva; só cola no traçado se estiver perto.
  if (r.lat == null || r.lng == null) return null;
  const p = projetar(cam, { lat: r.lat, lng: r.lng });
  return p.dist <= LONGE_M ? pronto(p.s, p.dist) : null;
}

// KML com o rompimento, a medição e o caminho do cabo entre eles seguindo o traçado da rota.
export function kmlRompimentoTracado(nome: string, desc: string, rompimento: Coord, medicao: PontoKml | null, caminho: Coord[]) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const c = (p: Coord) => `${p.lng.toFixed(7)},${p.lat.toFixed(7)},0`;
  const marca = (n: string, d: string, estilo: string, p: Coord) =>
    `<Placemark><name>${esc(n)}</name><description>${esc(d)}</description><styleUrl>#${estilo}</styleUrl><Point><coordinates>${c(p)}</coordinates></Point></Placemark>`;
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(nome)}</name>`
    + `<Style id="r"><IconStyle><color>ff0000ff</color><scale>1.4</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>`
    + `<Style id="m"><IconStyle><color>ffff7f00</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href></Icon></IconStyle></Style>`
    + `<Style id="l"><LineStyle><color>c00000ff</color><width>4</width></LineStyle></Style>`
    + marca(nome, desc, 'r', rompimento)
    + (medicao ? marca(`Medição OTDR: ${medicao.nome}`, 'Ponto onde o OTDR foi ligado', 'm', medicao) : '')
    + (caminho.length >= 2 ? `<Placemark><name>Cabo da medição ao rompimento</name><styleUrl>#l</styleUrl><LineString><tessellate>1</tessellate><coordinates>${caminho.map(c).join(' ')}</coordinates></LineString></Placemark>` : '')
    + `</Document></kml>`;
}

// Douglas-Peucker: tira os pontos que não mudam o desenho (tolerância em metros), para guardar e baixar pouco.
export function simplificar(cam: Coord[], tol = 3): Coord[] {
  if (cam.length <= 2) return cam;
  const kx = Math.cos((cam[0].lat * Math.PI) / 180);
  const M = 111320;
  const xy = cam.map((p) => [p.lng * kx * M, p.lat * M]);
  const manter = new Uint8Array(cam.length);
  manter[0] = manter[cam.length - 1] = 1;
  const pilha: [number, number][] = [[0, cam.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop()!;
    const [ax, ay] = xy[i], [bx, by] = xy[j];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let maior = -1, k = -1;
    for (let n = i + 1; n < j; n++) {
      const d = Math.abs(dy * xy[n][0] - dx * xy[n][1] + bx * ay - by * ax) / L;
      if (d > maior) { maior = d; k = n; }
    }
    if (maior > tol) { manter[k] = 1; pilha.push([i, k], [k, j]); }
  }
  return cam.filter((_, i) => manter[i]).map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
}

// O que fica guardado da rota: o caminho do cabo já encadeado e simplificado, e os pontos com nome.
export type TracadoSalvo = { caminho: Coord[]; pontos: PontoKml[] };
// escolhidas: índices das linhas do trecho (KMZ geral com várias rotas); sem elas, usa todas.
// Com escolha, só ficam os pontos perto do trecho (até 500 m).
export function prepararTracado(t: Tracado, escolhidas?: number[]): TracadoSalvo {
  const linhas = escolhidas?.length ? escolhidas.map((i) => t.linhas[i]).filter(Boolean) : t.linhas;
  const caminho = simplificar(encadear(linhas));
  const pontos = escolhidas?.length && caminho.length >= 2 ? t.pontos.filter((p) => projetar(caminho, p).dist <= 500) : t.pontos;
  return { caminho, pontos: pontos.map((p) => ({ nome: p.nome.slice(0, 60), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })) };
}

// Ponto com marca de metragem pertence ao cabo deste lance? Com traçado: até 300 m dele; sem: perto da reta entre as caixas.
export function pertoDoLance(cam: Coord[] | null, de: Coord, para: Coord) {
  if (cam && cam.length >= 2) return (p: Coord) => projetar(cam, p).dist <= 300;
  const reta = [de, para];
  const limite = Math.max(500, distanciaMetros(de, para) * 0.3);
  return (p: Coord) => projetar(reta, p).dist <= limite;
}

// Onde marcar um evento: marcas de metragem da vistoria (mais preciso) > traçado do KMZ > linha reta entre as caixas.
export function pontoDoEvento(r: Rompimento, lances: LanceCabo[], cam: Coord[] | null, medicao: CaixaRede, marcas: MarcaNoCaminho[]) {
  const noTracado = cam ? rompimentoNoTracado(r, lances, cam, medicao) : null;
  const refino = r.tipo === 'lance' && marcas.length && r.lance.de.latitude != null && r.lance.para.latitude != null
    ? refinarPorMarcas(r, marcas, pertoDoLance(cam, { lat: r.lance.de.latitude, lng: r.lance.de.longitude! }, { lat: r.lance.para.latitude, lng: r.lance.para.longitude! }))
    : null;
  const ponto: Coord | null = refino ? { lat: refino.lat, lng: refino.lng } : noTracado ? { lat: noTracado.lat, lng: noTracado.lng }
    : r.tipo !== 'sem_medida' && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
  return { ponto, noTracado, refino };
}

// KML com todos os eventos de uma curva do OTDR marcados na rede (cor pela situação) e o ponto de medição.
export type EventoNoMapa = { nome: string; desc: string; nivel: 'ok' | 'atencao' | 'critico'; ponto: Coord };
export function kmlEventosCurva(nome: string, medicao: PontoKml | null, eventos: EventoNoMapa[]) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const c = (p: Coord) => `${p.lng.toFixed(7)},${p.lat.toFixed(7)},0`;
  const estilo = (id: string, cor: string, icone: string, escala = 1.2) =>
    `<Style id="${id}"><IconStyle><color>${cor}</color><scale>${escala}</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/${icone}.png</href></Icon></IconStyle></Style>`;
  const marca = (n: string, d: string, e: string, p: Coord) =>
    `<Placemark><name>${esc(n)}</name><description>${esc(d)}</description><styleUrl>#${e}</styleUrl><Point><coordinates>${c(p)}</coordinates></Point></Placemark>`;
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(nome)}</name>`
    + estilo('critico', 'ff0000ff', 'caution', 1.4) + estilo('atencao', 'ff00a5ff', 'caution') + estilo('ok', 'ff00b000', 'placemark_circle')
    + estilo('m', 'ffff7f00', 'triangle')
    + (medicao ? marca(`Medição OTDR: ${medicao.nome}`, 'Ponto onde o OTDR foi ligado', 'm', medicao) : '')
    + eventos.map((e) => marca(e.nome, e.desc, e.nivel, e.ponto)).join('')
    + `</Document></kml>`;
}

// Eventos de uma curva do OTDR postos direto sobre o traçado do KMZ (sem precisar das caixas mapeadas):
// a medição é numa ponta do traçado; a distância da fibra vira metros de cabo descontando o excesso de fibra
// e as reservas técnicas (quantidade × metros) e anda pelo traçado.
export type EventoNoTracado = { distanciaKm: number; metrosCabo: number; s: number; ponto: Coord; alemM: number; perto: { nome: string; dist: number } | null };
export function eventosNoTracado(cam: Coord[], pontos: PontoKml[], distanciasKm: number[], o: { excessoPct?: number; reservas?: ReservasAvulsas | null }) {
  const L = comprimento(cam);
  return distanciasKm.map((d): EventoNoTracado => {
    const semExcesso = d / (1 + (o.excessoPct ?? 0) / 100);
    const metrosCabo = descontarReservas(semExcesso, L, o.reservas ?? null) * 1000;
    const s = Math.min(metrosCabo, L);
    const ponto = pontoEm(cam, s);
    const perto = pontos.reduce<{ nome: string; dist: number } | null>((m, p) => {
      const dist = distanciaMetros(p, ponto);
      return dist <= 300 && (!m || dist < m.dist) ? { nome: p.nome, dist } : m;
    }, null);
    return { distanciaKm: d, metrosCabo, s, ponto, alemM: Math.max(0, metrosCabo - L), perto };
  });
}

// Ponto do KMZ mais perto de uma ponta do traçado (para dizer "DGO X" em vez de "início da linha").
export function pontaDoTracado(cam: Coord[], pontos: PontoKml[], fim: boolean) {
  const p = fim ? cam[cam.length - 1] : cam[0];
  const perto = pontos.map((x) => ({ nome: x.nome, dist: distanciaMetros(x, p) })).sort((a, b) => a.dist - b.dist)[0];
  return { ...p, nome: perto && perto.dist <= 500 ? perto.nome : null };
}
