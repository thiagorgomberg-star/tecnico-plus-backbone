// Leitura de arquivos .SOR de OTDR (padrão Bellcore/Telcordia SR-4731, versões 1 e 2) e análise dos eventos.
// O mesmo arquivo existe no painel e no app (apps/painel/src/lib/sor.ts e apps/mobile/src/lib/sor.ts): mantenha os dois iguais.

const VELOCIDADE_LUZ = 0.299792458; // km/µs

export type EventoSor = {
  numero: number;
  distanciaKm: number;
  perdaDb: number; // perda na emenda/conector (negativo = ganho aparente)
  reflectanciaDb: number; // 0 = não reflexivo
  inclinacaoDbKm: number; // atenuação do lance que termina neste evento
  reflexivo: boolean;
  fimDeFibra: boolean;
  manual: boolean;
  codigo: string;
  comentario: string;
  detectado?: boolean; // encontrado pela leitura da curva toda (não estava entre os eventos salvos pelo OTDR)
};

export type Sor = {
  versao: number;
  equipamento: string;
  fabricante: string;
  serie: string;
  cabo: string;
  fibra: string;
  localA: string;
  localB: string;
  operador: string;
  comentario: string;
  data: Date | null;
  comprimentoOndaNm: number; // nominal (1310, 1550, 1625...), usada nos limites
  ondaRealNm: number; // onda real do laser gravada pelo OTDR (ex.: 1618,2), 0 se não veio
  pulsoNs: number;
  indiceRefracao: number;
  resolucaoM: number;
  alcanceKm: number;
  eventos: EventoSor[];
  perdaTotalDb: number | null;
  orlDb: number | null;
  traco: { km: number; db: number }[]; // nível do sinal retroespalhado em dB (cai ao longo da fibra), reduzido para desenhar
  niveis: Float32Array; // todos os pontos do traço em dB, um a cada `resolucaoM`, para o zoom
};

const JANELAS = [850, 1300, 1310, 1383, 1410, 1490, 1550, 1610, 1625, 1650];
function ondaNominal(nm: number) {
  const j = JANELAS.reduce((m, x) => (Math.abs(x - nm) < Math.abs(m - nm) ? x : m));
  return Math.abs(j - nm) <= 15 ? j : Math.round(nm);
}

// "1618,2 nm (nominal 1625 nm)" quando a onda real difere da nominal. 1625/1650 nm é medição em fibra ativa (com tráfego).
export function rotuloOnda(s: Pick<Sor, 'comprimentoOndaNm' | 'ondaRealNm'>, comAtiva = true) {
  const n = s.comprimentoOndaNm, r = s.ondaRealNm;
  if (!n && !r) return '—';
  const real = r && Math.abs(r - n) >= 0.05 ? `${r.toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false })} nm (nominal ${n} nm)` : `${n || r} nm`;
  return real + (comAtiva && ehFibraAtiva(s) ? ' · fibra ativa' : '');
}
export const ehFibraAtiva = (s: Pick<Sor, 'comprimentoOndaNm'>) => s.comprimentoOndaNm >= 1600;

class Leitor {
  private v: DataView;
  private bytes: Uint8Array;
  pos = 0;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u16() { const x = this.v.getUint16(this.pos, true); this.pos += 2; return x; }
  i16() { const x = this.v.getInt16(this.pos, true); this.pos += 2; return x; }
  u32() { const x = this.v.getUint32(this.pos, true); this.pos += 4; return x; }
  i32() { const x = this.v.getInt32(this.pos, true); this.pos += 4; return x; }
  fixo(n: number) {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += n;
    return s;
  }
  texto() {
    let s = '';
    while (this.pos < this.bytes.length && this.bytes[this.pos] !== 0) s += String.fromCharCode(this.bytes[this.pos++]);
    this.pos++;
    return s.trim();
  }
}

export function lerSor(dados: ArrayBuffer | Uint8Array): Sor {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  const l = new Leitor(bytes);

  // Mapa: lista os blocos e o tamanho de cada um (a versão 2 começa com o texto "Map").
  const v2 = l.texto() === 'Map';
  if (!v2) l.pos = 0;
  l.u16();
  const tamanhoMapa = l.u32();
  const nBlocos = l.u16() - 1;
  if (tamanhoMapa < 8 || nBlocos < 1 || nBlocos > 60) throw new Error('Arquivo não parece um .SOR de OTDR.');
  const blocos: Record<string, { pos: number; tam: number }> = {};
  let inicio = tamanhoMapa;
  for (let i = 0; i < nBlocos; i++) {
    const nome = l.texto();
    l.u16();
    const tam = l.u32();
    blocos[nome] = { pos: inicio, tam };
    inicio += tam;
  }
  const ir = (nome: string) => {
    const b = blocos[nome];
    if (!b) return false;
    l.pos = b.pos + (v2 ? nome.length + 1 : 0);
    return true;
  };
  if (!blocos.FxdParams || !blocos.KeyEvents) throw new Error('Arquivo .SOR sem parâmetros ou sem eventos.');

  const s: Sor = {
    versao: v2 ? 2 : 1, equipamento: '', fabricante: '', serie: '', cabo: '', fibra: '', localA: '', localB: '', operador: '',
    comentario: '', data: null, comprimentoOndaNm: 0, ondaRealNm: 0, pulsoNs: 0, indiceRefracao: 1.4682, resolucaoM: 0, alcanceKm: 0,
    eventos: [], perdaTotalDb: null, orlDb: null, traco: [], niveis: new Float32Array(0),
  };

  if (ir('GenParams')) {
    try {
      l.fixo(2); // idioma
      s.cabo = l.texto();
      s.fibra = l.texto();
      if (v2) l.u16(); // tipo de fibra
      const onda = l.u16();
      if (onda) s.comprimentoOndaNm = ondaNominal(onda);
      s.localA = l.texto();
      s.localB = l.texto();
      l.texto(); // código do cabo
      l.fixo(2); // condição
      l.i32();
      if (v2) l.i32();
      s.operador = l.texto();
      s.comentario = l.texto();
    } catch { /* bloco opcional */ }
  }

  if (ir('SupParams')) {
    try {
      s.fabricante = l.texto();
      s.equipamento = l.texto();
      s.serie = l.texto();
    } catch { /* bloco opcional */ }
  }

  ir('FxdParams');
  const quando = l.u32();
  s.data = quando ? new Date(quando * 1000) : null;
  l.fixo(2); // unidade
  // FxdParams traz a onda real do laser (ex.: 1618,2 nm); o relatório usa a nominal (1625), que vem no GenParams.
  // Sem a nominal, arredonda para a janela mais próxima.
  const onda = l.u16() / 10;
  if (onda) s.ondaRealNm = onda;
  if (onda && !s.comprimentoOndaNm) s.comprimentoOndaNm = ondaNominal(onda);
  l.i32();
  if (v2) l.i32();
  const nPulsos = Math.min(l.u16(), 10);
  const pulsos = Array.from({ length: nPulsos }, () => l.u16());
  const espacamentos = Array.from({ length: nPulsos }, () => l.u32());
  const pontos = Array.from({ length: nPulsos }, () => l.u32());
  const indice = l.u32() / 100000;
  if (indice > 1.3 && indice < 1.7) s.indiceRefracao = indice;
  s.pulsoNs = pulsos[0] ?? 0;
  // Espaçamento entre pontos em unidades de 10⁻⁸ µs; vira distância com a velocidade da luz na fibra (c / n).
  const resolucaoKm = ((espacamentos[0] ?? 0) * 1e-8 * VELOCIDADE_LUZ) / s.indiceRefracao;
  s.resolucaoM = resolucaoKm * 1000;
  s.alcanceKm = resolucaoKm * (pontos[0] ?? 0);

  // Eventos: tempo em unidades de 100 ps (só ida).
  const fator = (1e-4 * VELOCIDADE_LUZ) / s.indiceRefracao;
  ir('KeyEvents');
  const nEventos = l.u16();
  // Alguns OTDRs gravam campos a mais ou a menos por evento: se o bloco acabar antes, fica com os eventos já lidos.
  const fimEventos = blocos.KeyEvents.pos + blocos.KeyEvents.tam;
  for (let i = 0; i < nEventos && l.pos < fimEventos; i++) {
    const inicioEvento = l.pos;
    try {
    const numero = l.u16();
    const distanciaKm = l.u32() * fator;
    const inclinacao = l.i16() / 1000;
    const perda = l.i16() / 1000;
    const reflectancia = l.i32() / 1000;
    const codigo = l.fixo(8);
    if (v2) for (let k = 0; k < 5; k++) l.u32();
    const comentario = l.texto();
    s.eventos.push({
      numero, distanciaKm, perdaDb: perda, reflectanciaDb: reflectancia, inclinacaoDbKm: inclinacao,
      reflexivo: codigo[0] === '1' || codigo[0] === '2', fimDeFibra: codigo[1] === 'E', manual: codigo[1] === 'A' || codigo[1] === 'M',
      codigo, comentario,
    });
    } catch {
      l.pos = inicioEvento;
      break;
    }
  }
  try {
    if (l.pos + 14 > fimEventos) throw new Error();
    s.perdaTotalDb = l.i32() / 1000;
    l.i32();
    l.u32();
    s.orlDb = l.u16() / 1000;
  } catch { /* resumo opcional */ }
  // Sem a marca "E", o último evento é o fim da fibra.
  if (s.eventos.length && !s.eventos.some((e) => e.fimDeFibra)) s.eventos[s.eventos.length - 1].fimDeFibra = true;

  if (ir('DataPts')) {
    try {
      const n = l.u32();
      const nTracos = l.i16();
      l.u32();
      const escala = l.u16() / 1000 || 1;
      if (nTracos >= 1 && n > 1 && l.pos + n * 2 <= bytes.length) {
        const brutos = new Uint16Array(n);
        let maior = 0;
        for (let i = 0; i < n; i++) { brutos[i] = l.u16(); if (brutos[i] > maior) maior = brutos[i]; }
        // Nível em dB: valor bruto maior = menos potência. No máximo ~1500 faixas para desenhar; cada faixa guarda o
        // mínimo e o máximo para não esconder reflexões nem quedas.
        const fs = 0.001 * escala;
        s.niveis = Float32Array.from(brutos, (b) => (maior - b) * fs);
        const passo = Math.max(1, Math.ceil(n / 1500));
        for (let i = 0; i < n; i += passo) {
          let alto = brutos[i], baixo = brutos[i];
          for (let k = i; k < Math.min(n, i + passo); k++) { if (brutos[k] > alto) alto = brutos[k]; if (brutos[k] < baixo) baixo = brutos[k]; }
          s.traco.push({ km: i * resolucaoKm, db: (maior - baixo) * fs });
          if (alto !== baixo) s.traco.push({ km: (i + passo / 2) * resolucaoKm, db: (maior - alto) * fs });
        }
      }
    } catch { /* traço opcional */ }
  }
  return s;
}

// Pedaço do traço entre dois pontos (km) com no máximo ~`maxFaixas` faixas; cada faixa guarda o mínimo e o máximo.
export function tracoJanela(s: Sor, iniKm: number, fimKm: number, maxFaixas = 600) {
  const passoKm = s.resolucaoM / 1000;
  if (!s.niveis.length || !passoKm) return s.traco.filter((p) => p.km >= iniKm && p.km <= fimKm);
  const a = Math.max(0, Math.floor(iniKm / passoKm)), b = Math.min(s.niveis.length - 1, Math.ceil(fimKm / passoKm));
  const passo = Math.max(1, Math.ceil((b - a + 1) / maxFaixas));
  const saida: { km: number; db: number }[] = [];
  for (let i = a; i <= b; i += passo) {
    let alto = s.niveis[i], baixo = s.niveis[i];
    for (let k = i; k < Math.min(b + 1, i + passo); k++) { if (s.niveis[k] > alto) alto = s.niveis[k]; if (s.niveis[k] < baixo) baixo = s.niveis[k]; }
    saida.push({ km: i * passoKm, db: alto });
    if (alto !== baixo) saida.push({ km: (i + passo / 2) * passoKm, db: baixo });
  }
  return saida;
}

// Reta (mínimos quadrados) de y[a..b) em função do índice; null com menos de 5 pontos.
function reta(y: Float32Array, a: number, b: number) {
  a = Math.max(0, a); b = Math.min(y.length, b);
  const n = b - a;
  if (n < 5) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = a; i < b; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const d = n * sxx - sx * sx;
  if (!d) return null;
  const inc = (n * sxy - sx * sy) / d;
  return { inc, b0: (sy - inc * sx) / n, em: (x: number) => (sy - inc * sx) / n + inc * x };
}

function mediaMovel(y: Float32Array, m: number) {
  const n = y.length, out = new Float32Array(n);
  const acc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + y[i];
  const h = Math.floor(m / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n, i - h + m);
    out[i] = (acc[b] - acc[a]) / (b - a);
  }
  return out;
}

// Lê a curva inteira e encontra degraus (emendas, curvaturas) e picos (conectores) que o OTDR não salvou como evento.
// Muitos OTDRs gravam só os eventos acima do limiar configurado; aqui a curva é varrida ponto a ponto.
export function detectarEventos(s: Sor): EventoSor[] {
  const y = s.niveis, N = y.length, r = s.resolucaoM / 1000;
  if (N < 50 || !r) return [];
  const fimEv = s.eventos.find((e) => e.fimDeFibra);
  let fim = Math.min(N - 1, fimEv ? Math.round(fimEv.distanciaKm / r) : N - 1);
  const pulsoKm = (0.2042 * (s.pulsoNs || 100)) / 1000 / 2;
  const g = Math.max(4, Math.round(pulsoKm / r)), h = g;
  const m = Math.max(3, Math.floor(g / 2));
  const ys = mediaMovel(y, m);
  const res2 = new Float32Array(N);
  for (let i = 0; i < N; i++) res2[i] = (y[i] - ys[i]) ** 2;
  const sig = mediaMovel(res2, Math.max(20, Math.round(1 / r))).map(Math.sqrt);
  const dy = new Float32Array(N);
  for (let i = h; i < N - h; i++) dy[i] = (ys[i - h] - ys[i + h]) / (2 * h * r);
  // Atenuação típica da fibra (mediana da inclinação) para separar o que é degrau do que é a queda normal.
  const ia = Math.round(2 / r), ib = Math.min(fim, Math.round(30 / r));
  const amostra = Array.from(dy.subarray(Math.min(ia, ib), ib)).sort((a, b) => a - b);
  const alfa = amostra.length ? amostra[Math.floor(amostra.length / 2)] : 0;
  const exc = new Float32Array(N), lim = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    exc[i] = (dy[i] - alfa) * 2 * h * r;
    lim[i] = Math.max(0.06, 4 * sig[i] * Math.sqrt(2 / m) * 2);
  }
  // Para onde o ruído já engole degraus de 0,5 dB (fim do alcance útil).
  const k0 = Math.round(1 / r);
  // (só depois dos primeiros 3 km, onde a zona morta do pulso também eleva o ruído, e quando dura 1 km seguido)
  for (let i = Math.max(k0, Math.round(3 / r)), seguidos = 0; i < fim; i++) {
    seguidos = lim[i] > 0.5 ? seguidos + 1 : 0;
    if (seguidos >= Math.round(1 / r)) { fim = i - seguidos; break; }
  }
  const regs: [number, number][] = [];
  for (let i = k0; i < fim;) {
    if (Math.abs(exc[i]) > lim[i]) {
      const sg = Math.sign(exc[i]);
      let j = i;
      while (j < fim && Math.sign(exc[j]) === sg && Math.abs(exc[j]) > lim[j] * 0.5) j++;
      regs.push([i, j]);
      i = j;
    } else i++;
  }
  const L = Math.round(1 / r);
  const achados: EventoSor[] = [];
  regs.forEach(([a, b], k) => {
    const c = Math.floor((a + b) / 2);
    const antes = k > 0 ? regs[k - 1][1] : k0, depois = k + 1 < regs.length ? regs[k + 1][0] : fim;
    const esq = reta(y, Math.max(antes, a - L), a), dir = reta(y, b, Math.min(depois, b + L));
    if (!esq || !dir) return;
    const perda = esq.em(c) - dir.em(c);
    let pico = -Infinity;
    for (let i = Math.max(0, a - h); i < Math.min(N, b + h); i++) pico = Math.max(pico, y[i] - esq.em(i));
    const reflexivo = pico > 0.5;
    if (Math.abs(perda) < 0.05 && !reflexivo) return;
    achados.push({
      numero: 0, distanciaKm: c * r, perdaDb: Math.round(perda * 1000) / 1000, reflectanciaDb: 0,
      inclinacaoDbKm: Math.max(0, -esq.inc / r), reflexivo, fimDeFibra: false, manual: false,
      codigo: reflexivo ? '1F' : '0F', comentario: '', detectado: true,
    });
  });
  return achados;
}

// Eventos salvos pelo OTDR + os encontrados lendo a curva toda (os salvos têm prioridade quando coincidem).
export function curvaCompleta(s: Sor): Sor {
  const r = s.resolucaoM / 1000;
  const pulsoKm = (0.2042 * (s.pulsoNs || 100)) / 1000 / 2;
  const perto = Math.max(2 * pulsoKm, 4 * r, 0.05);
  const novos = detectarEventos(s).filter((d) => !s.eventos.some((e) => Math.abs(e.distanciaKm - d.distanciaKm) < perto));
  const eventos = [...s.eventos.map((e) => ({ ...e })), ...novos].sort((a, b) => a.distanciaKm - b.distanciaKm);
  // Atenuação de cada lance recalculada entre os eventos vizinhos (os lances ficaram mais curtos).
  const g = Math.max(4, Math.round(pulsoKm / (r || 1)));
  eventos.forEach((e, i) => {
    e.numero = i + 1;
    if (i === 0 || !r || !s.niveis.length) return;
    const a = Math.round(eventos[i - 1].distanciaKm / r) + 2 * g, b = Math.round(e.distanciaKm / r) - 2 * g;
    const f = b - a >= 0.5 / r ? reta(s.niveis, a, b) : null;
    if (f) e.inclinacaoDbKm = Math.max(0, -f.inc / r);
  });
  return { ...s, eventos };
}

export type Nivel = 'ok' | 'atencao' | 'critico';
export type Diagnostico = { evento: EventoSor; tipo: string; nivel: Nivel; texto: string };

// Classificação dos eventos com limites usuais de campo (fusão até 0,1 dB boa, até 0,3 dB aceitável; conector até
// 0,75 dB; reflexão acima de -35 dB indica conector sujo/aberto ou fibra partida).
export function analisarSor(s: Sor, extensaoRotaKm?: number | null) {
  const limiteLance = s.comprimentoOndaNm >= 1500 ? 0.3 : 0.45;
  const fim = s.eventos.find((e) => e.fimDeFibra) ?? s.eventos[s.eventos.length - 1];
  const comprimentoKm = fim?.distanciaKm ?? 0;
  const diagnosticos: Diagnostico[] = s.eventos.map((e, i) => {
    const anterior = i > 0 ? s.eventos[i - 1] : null;
    if (e.fimDeFibra) {
      const curto = extensaoRotaKm && comprimentoKm < extensaoRotaKm * 0.97;
      return {
        evento: e, tipo: 'Fim da fibra', nivel: curto ? 'critico' : 'ok',
        texto: curto
          ? `A fibra termina a ${km(comprimentoKm)}, antes da extensão cadastrada do trecho (${km(extensaoRotaKm!)}). Possível rompimento neste ponto.`
          : `Fim da fibra a ${km(comprimentoKm)}.`,
      };
    }
    if (i === 0 && e.distanciaKm < 0.05) {
      return { evento: e, tipo: 'Conector do OTDR', nivel: e.reflectanciaDb > -35 && e.reflectanciaDb !== 0 ? 'atencao' : 'ok',
        texto: e.reflectanciaDb > -35 && e.reflectanciaDb !== 0 ? 'Reflexão alta na saída: limpe o conector do OTDR e do cordão.' : 'Início da medição.' };
    }
    const lanceAlto = anterior && e.inclinacaoDbKm > limiteLance
      ? ` Atenuação alta no lance anterior (${dec(e.inclinacaoDbKm)} dB/km): verificar curvatura ou cabo esmagado entre ${km(anterior.distanciaKm)} e ${km(e.distanciaKm)}.` : '';
    if (e.reflexivo) {
      const refl = e.reflectanciaDb !== 0 && e.reflectanciaDb > -35;
      const nivel: Nivel = e.perdaDb > 1.5 || (refl && e.perdaDb > 0.75) ? 'critico' : e.perdaDb > 0.75 || refl || lanceAlto ? 'atencao' : 'ok';
      const texto = e.perdaDb > 1.5
        ? `Perda muito alta (${dec(e.perdaDb)} dB) com reflexão: possível fibra partida/trincada ou conector aberto. Inspecionar no local.`
        : e.perdaDb > 0.75 ? `Conector/emenda mecânica com perda alta (${dec(e.perdaDb)} dB): limpar, inspecionar e refazer a conexão.`
          : refl ? `Reflexão alta (${dec(e.reflectanciaDb)} dB): conector sujo, mal encaixado ou polimento ruim.`
            : 'Conector dentro do esperado.';
      return { evento: e, tipo: 'Conector / reflexão', nivel, texto: texto + lanceAlto };
    }
    if (e.perdaDb < -0.05) {
      return { evento: e, tipo: 'Emenda (ganho)', nivel: lanceAlto ? 'atencao' : 'ok',
        texto: `Ganho aparente de ${dec(-e.perdaDb)} dB: comum em emenda de fibras diferentes. Confirme medindo nos dois sentidos.${lanceAlto}` };
    }
    const nivel: Nivel = e.perdaDb > 0.5 ? 'critico' : e.perdaDb > 0.3 || lanceAlto ? 'atencao' : 'ok';
    const texto = e.perdaDb > 0.5
      ? `Perda alta (${dec(e.perdaDb)} dB) sem reflexão: macrocurvatura, fibra estrangulada na caixa ou fusão ruim. Abrir a caixa e refazer a acomodação/fusão.`
      : e.perdaDb > 0.3 ? `Emenda acima do aceitável (${dec(e.perdaDb)} dB): conferir acomodação na bandeja e refazer a fusão se preciso.`
        : 'Emenda dentro do esperado.';
    return { evento: e, tipo: e.perdaDb > 0.5 ? 'Perda / curvatura' : 'Emenda', nivel, texto: texto + lanceAlto };
  });
  const perdaTotal = s.perdaTotalDb || s.eventos.reduce((t, e) => t + Math.max(0, e.perdaDb), 0);
  return {
    comprimentoKm,
    perdaTotalDb: perdaTotal,
    atenuacaoMediaDbKm: comprimentoKm > 0 ? perdaTotal / comprimentoKm : null,
    diagnosticos,
    criticos: diagnosticos.filter((d) => d.nivel === 'critico').length,
    atencao: diagnosticos.filter((d) => d.nivel === 'atencao').length,
  };
}

const dec = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km`);

// O celular (Android) às vezes entrega o .SOR sem extensão ("Documento", "file"...): o arquivo vale pelo conteúdo.
// Devolve o nome com ".sor" se o conteúdo for uma curva, ou null se não for.
export function nomeDaCurva(nome: string, dados: ArrayBuffer | Uint8Array): string | null {
  try {
    const s = lerSor(dados);
    if (/\.sor$/i.test(nome)) return nome;
    const base = [s.cabo, s.fibra && `F${s.fibra}`, s.comprimentoOndaNm && `${s.comprimentoOndaNm}nm`].filter(Boolean).join("_") || nome || "curva";
    return `${base.replace(/[\\/:*?"<>|]+/g, "_")}.sor`;
  } catch {
    return null;
  }
}
