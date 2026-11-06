// Comparativo de curvas OTDR da mesma fibra (cópia idêntica em apps/painel e apps/mobile).
// - Bidirecional (A→B × B→A): a perda real de uma emenda é a média dos dois sentidos; num sentido só ela pode
//   aparecer como ganho (fibras com retroespalhamento diferente). As distâncias do B→A são espelhadas para A.
// - Antes × depois (mesmo sentido): mostra o que mudou entre duas medições (emenda que piorou, evento novo, fibra mais curta).
import { EventoSor, km, Nivel, Sor, tracoJanela } from './sor';

export type Sentido = 'AB' | 'BA';
export type Momento = 'antes' | 'depois' | '';
export const ROTULO_SENTIDO: Record<Sentido, string> = { AB: 'A → B', BA: 'B → A' };
export const ROTULO_MOMENTO: Record<Momento, string> = { antes: 'Antes', depois: 'Depois', '': '—' };

export type LinhaComparada = {
  km: number;
  perda1: number | null; // A→B (bidirecional) ou antes
  perda2: number | null; // B→A (bidirecional) ou depois
  resultado: number | null; // média (bidirecional) ou diferença depois − antes
  reflexivo: boolean;
  lidoDaCurva: boolean;
  nivel: Nivel;
  situacao: string;
  texto: string;
};

export type Comparacao = {
  tipo: 'bidirecional' | 'antesDepois';
  comprimento1Km: number;
  comprimento2Km: number;
  perdaTotal1Db: number;
  perdaTotal2Db: number;
  linhas: LinhaComparada[];
  avisos: { nivel: Nivel; texto: string }[];
  criticos: number;
  atencao: number;
};

const dec = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pulsoKm = (s: Sor) => (0.2042 * (s.pulsoNs || 100)) / 1000 / 2;
const tolerancia = (a: Sor, b: Sor) => Math.min(1, Math.max(0.1, pulsoKm(a) + pulsoKm(b)));
export const fimDaFibra = (s: Sor) => (s.eventos.find((e) => e.fimDeFibra) ?? s.eventos[s.eventos.length - 1])?.distanciaKm ?? 0;
const perdaTotal = (s: Sor) => s.perdaTotalDb || s.eventos.reduce((t, e) => t + Math.max(0, e.perdaDb), 0);
// Eventos do meio da fibra (sem o conector do OTDR e sem o fim).
const meio = (s: Sor) => s.eventos.filter((e, i) => !e.fimDeFibra && !(i === 0 && e.distanciaKm < 0.05));

// Pareia eventos pela distância (o mais próximo dentro da tolerância, sem repetir).
function parear(a: { km: number; e: EventoSor }[], b: { km: number; e: EventoSor }[], tol: number) {
  const usados = new Set<number>();
  const pares: { km: number; x: EventoSor | null; y: EventoSor | null }[] = [];
  for (const p of a) {
    let melhor = -1, dist = tol;
    b.forEach((q, j) => { const d = Math.abs(q.km - p.km); if (!usados.has(j) && d <= dist) { melhor = j; dist = d; } });
    if (melhor >= 0) { usados.add(melhor); pares.push({ km: (p.km + b[melhor].km) / 2, x: p.e, y: b[melhor].e }); } else pares.push({ km: p.km, x: p.e, y: null });
  }
  b.forEach((q, j) => { if (!usados.has(j)) pares.push({ km: q.km, x: null, y: q.e }); });
  return pares.sort((p, q) => p.km - q.km);
}

function nivelPerda(perda: number, reflexivo: boolean): Nivel {
  if (reflexivo) return perda > 1.5 ? 'critico' : perda > 0.75 ? 'atencao' : 'ok';
  return perda > 0.5 ? 'critico' : perda > 0.3 ? 'atencao' : 'ok';
}

function resumir(c: Omit<Comparacao, 'criticos' | 'atencao'>): Comparacao {
  const todos = [...c.linhas.map((l) => l.nivel), ...c.avisos.map((a) => a.nivel)];
  return { ...c, criticos: todos.filter((n) => n === 'critico').length, atencao: todos.filter((n) => n === 'atencao').length };
}

export function compararBidirecional(ab: Sor, ba: Sor): Comparacao {
  const L1 = fimDaFibra(ab), L2 = fimDaFibra(ba);
  const escala = L2 > 0 ? L1 / L2 : 1;
  const pares = parear(
    meio(ab).map((e) => ({ km: e.distanciaKm, e })),
    meio(ba).map((e) => ({ km: (L2 - e.distanciaKm) * escala, e })),
    tolerancia(ab, ba),
  );
  const linhas: LinhaComparada[] = pares.map(({ km: k, x, y }) => {
    const reflexivo = !!(x?.reflexivo || y?.reflexivo);
    const lidoDaCurva = !!(x?.detectado || y?.detectado);
    if (x && y) {
      const media = (x.perdaDb + y.perdaDb) / 2;
      const nivel = nivelPerda(media, reflexivo);
      const ganho = x.perdaDb < -0.05 || y.perdaDb < -0.05;
      return {
        km: k, perda1: x.perdaDb, perda2: y.perdaDb, resultado: media, reflexivo, lidoDaCurva, nivel,
        situacao: nivel === 'critico' ? 'Crítico' : nivel === 'atencao' ? 'Atenção' : 'OK',
        texto: nivel === 'critico'
          ? `Perda real (média) de ${dec(media)} dB${reflexivo ? ' com reflexão: conector/emenda mecânica ruim ou fibra trincada' : ': fusão ruim, macrocurvatura ou fibra estrangulada'}. Ir ao local.`
          : nivel === 'atencao' ? `Perda real (média) de ${dec(media)} dB: acima do aceitável, conferir a emenda.`
            : ganho ? `Ganho aparente num sentido, mas a média (${dec(media)} dB) está boa: diferença entre as fibras emendadas.`
              : `Perda real (média) de ${dec(media)} dB: dentro do esperado.`,
      };
    }
    const e = (x ?? y)!;
    const nivel = nivelPerda(e.perdaDb, reflexivo);
    const lado = x ? 'A → B' : 'B → A';
    return {
      km: k, perda1: x?.perdaDb ?? null, perda2: y?.perdaDb ?? null, resultado: null, reflexivo, lidoDaCurva,
      nivel: nivel === 'ok' ? 'ok' : 'atencao', situacao: `Só ${lado}`,
      texto: `Evento visto só no sentido ${lado} (${dec(e.perdaDb)} dB). Pode estar na zona morta ou além do alcance do outro sentido; sem a média, a perda real não é confirmada.`,
    };
  });
  const avisos: Comparacao['avisos'] = [];
  const dif = Math.abs(L1 - L2);
  if (dif > Math.max(0.05, L1 * 0.01)) {
    avisos.push({ nivel: 'critico', texto: `Os comprimentos não batem: A → B mede ${km(L1)} e B → A mede ${km(L2)} (diferença de ${km(dif)}). Pode haver rompimento, fibra trocada no DGO ou IOR diferente nas duas medições.` });
  } else avisos.push({ nivel: 'ok', texto: `Comprimentos conferem nos dois sentidos: ${km(L1)} × ${km(L2)}.` });
  if (ab.comprimentoOndaNm !== ba.comprimentoOndaNm) avisos.push({ nivel: 'atencao', texto: `Comprimentos de onda diferentes (${ab.comprimentoOndaNm} nm × ${ba.comprimentoOndaNm} nm): a média só vale para a mesma onda.` });
  return resumir({ tipo: 'bidirecional', comprimento1Km: L1, comprimento2Km: L2, perdaTotal1Db: perdaTotal(ab), perdaTotal2Db: perdaTotal(ba), linhas, avisos });
}

export function compararAntesDepois(antes: Sor, depois: Sor): Comparacao {
  const L1 = fimDaFibra(antes), L2 = fimDaFibra(depois);
  const pares = parear(meio(antes).map((e) => ({ km: e.distanciaKm, e })), meio(depois).map((e) => ({ km: e.distanciaKm, e })), tolerancia(antes, depois));
  const linhas: LinhaComparada[] = pares.map(({ km: k, x, y }) => {
    const reflexivo = !!(x?.reflexivo || y?.reflexivo);
    const lidoDaCurva = !!(x?.detectado || y?.detectado);
    if (x && y) {
      const delta = y.perdaDb - x.perdaDb;
      const nivel: Nivel = delta > 0.3 ? 'critico' : delta > 0.1 ? 'atencao' : 'ok';
      return {
        km: k, perda1: x.perdaDb, perda2: y.perdaDb, resultado: delta, reflexivo, lidoDaCurva, nivel,
        situacao: delta > 0.1 ? 'Piorou' : delta < -0.1 ? 'Melhorou' : 'Igual',
        texto: delta > 0.1 ? `A perda aumentou ${dec(delta)} dB desde a medição anterior: conferir a caixa/emenda neste ponto.`
          : delta < -0.1 ? `A perda caiu ${dec(-delta)} dB (emenda refeita ou ajuste na acomodação).` : 'Sem mudança relevante.',
      };
    }
    if (y) {
      const nivel: Nivel = y.perdaDb > 0.3 || y.reflexivo ? 'critico' : 'atencao';
      return {
        km: k, perda1: null, perda2: y.perdaDb, resultado: y.perdaDb, reflexivo, lidoDaCurva, nivel, situacao: 'Novo',
        texto: `Evento novo de ${dec(y.perdaDb)} dB que não existia antes: curvatura, cabo esmagado ou emenda nova neste ponto.`,
      };
    }
    return {
      km: k, perda1: x!.perdaDb, perda2: null, resultado: -x!.perdaDb, reflexivo, lidoDaCurva, nivel: 'ok', situacao: 'Sumiu',
      texto: 'Evento da medição anterior que não aparece agora (emenda refeita ou abaixo do limiar).',
    };
  });
  const avisos: Comparacao['avisos'] = [];
  if (L2 < L1 * 0.97) avisos.push({ nivel: 'critico', texto: `A fibra agora termina a ${km(L2)}; antes ia até ${km(L1)}. Possível rompimento a ${km(L2)} do ponto de medição.` });
  else if (Math.abs(L1 - L2) > Math.max(0.05, L1 * 0.01)) avisos.push({ nivel: 'atencao', texto: `O comprimento mudou de ${km(L1)} para ${km(L2)}: conferir se a medição foi feita do mesmo ponto e com o mesmo IOR.` });
  else avisos.push({ nivel: 'ok', texto: `Mesmo comprimento nas duas medições (${km(L1)} × ${km(L2)}).` });
  const dp = perdaTotal(depois) - perdaTotal(antes);
  if (dp > 0.3) avisos.push({ nivel: 'atencao', texto: `A perda total subiu ${dec(dp)} dB (${dec(perdaTotal(antes))} → ${dec(perdaTotal(depois))} dB).` });
  return resumir({ tipo: 'antesDepois', comprimento1Km: L1, comprimento2Km: L2, perdaTotal1Db: perdaTotal(antes), perdaTotal2Db: perdaTotal(depois), linhas, avisos });
}

// Traço para sobrepor no gráfico: em dB relativos ao início de cada medição (0 = nível a 0,5 km da ponta onde o OTDR estava);
// o B → A é espelhado nas distâncias de A.
export function tracoParaComparar(s: Sor, espelharEm?: { comprimentoKm: number }) {
  const L = fimDaFibra(s) || 1;
  const pontos = tracoJanela(s, 0, L * 1.03, 700);
  if (!pontos.length) return [];
  const ref = pontos.find((p) => p.km >= 0.5)?.db ?? pontos[0].db;
  if (!espelharEm) return pontos.map((p) => ({ km: p.km, db: p.db - ref }));
  const escala = espelharEm.comprimentoKm / L;
  // O B → A começa em 0 dB no lado B (direita) e cai na direção de A.
  return pontos.filter((p) => p.km <= L).map((p) => ({ km: (L - p.km) * escala, db: p.db - ref })).reverse();
}
