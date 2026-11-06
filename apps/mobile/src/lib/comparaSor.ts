// Comparativo de curvas OTDR da mesma fibra (cópia idêntica em apps/painel e apps/mobile).
// - Bidirecional (A→B × B→A): a perda real de uma emenda é a média dos dois sentidos; num sentido só ela pode
//   aparecer como ganho (fibras com retroespalhamento diferente). As distâncias do B→A são espelhadas para A.
// - Antes × depois (mesmo sentido): mostra o que mudou entre duas medições (emenda que piorou, evento novo, fibra mais curta).
// - Duas fibras do mesmo cabo (mesmo sentido): perda nas duas no mesmo ponto = esforço no cabo ou caixa mal acomodada.
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
  tipo: 'bidirecional' | 'antesDepois' | 'fibras';
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

// Duas fibras do mesmo cabo, medidas no mesmo sentido: um ponto onde as DUAS perdem é esforço no cabo
// (torção, esmagamento, curvatura, cabo estrangulado na ferragem) ou acomodação ruim da caixa/bandeja;
// uma perda só numa fibra aponta a fusão/acomodação daquela fibra.
export function compararFibras(f1: Sor, f2: Sor, nomes: [string, string] = ['Fibra 1', 'Fibra 2']): Comparacao {
  const L1 = fimDaFibra(f1), L2 = fimDaFibra(f2);
  const pares = parear(meio(f1).map((e) => ({ km: e.distanciaKm, e })), meio(f2).map((e) => ({ km: e.distanciaKm, e })), tolerancia(f1, f2));
  const linhas: LinhaComparada[] = pares.map(({ km: k, x, y }) => {
    const reflexivo = !!(x?.reflexivo || y?.reflexivo);
    const lidoDaCurva = !!(x?.detectado || y?.detectado);
    if (x && y) {
      const comum = Math.min(x.perdaDb, y.perdaDb), maior = Math.max(x.perdaDb, y.perdaDb);
      const qual = x.perdaDb >= y.perdaDb ? nomes[0] : nomes[1];
      if (comum > 0.15) {
        const nivel: Nivel = comum > 0.3 ? 'critico' : 'atencao';
        return {
          km: k, perda1: x.perdaDb, perda2: y.perdaDb, resultado: comum, reflexivo, lidoDaCurva, nivel, situacao: 'Comum às duas',
          texto: `As duas fibras perdem no mesmo ponto (${dec(x.perdaDb)} e ${dec(y.perdaDb)} dB): ${reflexivo ? 'conector/caixa com problema que afeta o cabo todo' : 'esforço no cabo (torção, esmagamento, curvatura, cabo estrangulado na ferragem) ou acomodação ruim na caixa/bandeja'}. Ir ao local${nivel === 'atencao' ? ' na próxima passagem' : ''}.`,
        };
      }
      if (maior > 0.3) return {
        km: k, perda1: x.perdaDb, perda2: y.perdaDb, resultado: comum, reflexivo, lidoDaCurva, nivel: 'atencao', situacao: `Só ${qual}`,
        texto: `Só a ${qual} perde aqui (${dec(maior)} dB) e a outra está boa: fusão ruim ou fibra mal acomodada na bandeja (raio pequeno, presa na tampa). O cabo está bem neste ponto.`,
      };
      return {
        km: k, perda1: x.perdaDb, perda2: y.perdaDb, resultado: comum, reflexivo, lidoDaCurva, nivel: 'ok', situacao: 'Nas duas',
        texto: 'Evento nas duas fibras com perda baixa: emenda normal (caixa).',
      };
    }
    const e = (x ?? y)!;
    const qual = x ? nomes[0] : nomes[1];
    const nivel = nivelPerda(e.perdaDb, reflexivo);
    return {
      km: k, perda1: x?.perdaDb ?? null, perda2: y?.perdaDb ?? null, resultado: null, reflexivo, lidoDaCurva, nivel, situacao: `Só ${qual}`,
      texto: nivel === 'ok' ? `Evento pequeno só na ${qual} (${dec(e.perdaDb)} dB).`
        : `Perda de ${dec(e.perdaDb)} dB só na ${qual}: problema daquela fibra (fusão, acomodação ou microcurvatura), não do cabo.`,
    };
  });
  const avisos: Comparacao['avisos'] = [];
  const dif = Math.abs(L1 - L2);
  if (dif > Math.max(0.05, Math.max(L1, L2) * 0.01)) {
    const curta = L1 < L2 ? nomes[0] : nomes[1];
    avisos.push({ nivel: 'critico', texto: `Os comprimentos não batem: ${nomes[0]} vai até ${km(L1)} e ${nomes[1]} até ${km(L2)}. A ${curta} pode estar rompida ou terminar antes (sangria/derivação); confira também se as duas foram medidas do mesmo ponto e com o mesmo IOR.` });
  } else avisos.push({ nivel: 'ok', texto: `As duas fibras têm o mesmo comprimento (${km(L1)} × ${km(L2)}).` });
  const nasDuas = linhas.filter((l) => l.perda1 != null && l.perda2 != null).length;
  const so1 = linhas.filter((l) => l.perda1 != null && l.perda2 == null).length, so2 = linhas.filter((l) => l.perda2 != null && l.perda1 == null).length;
  avisos.push({ nivel: 'ok', texto: `${nasDuas} evento(s) nas duas fibras (pontos em comum), ${so1} só na ${nomes[0]} e ${so2} só na ${nomes[1]} (pontos isolados).` });
  const comuns = linhas.filter((l) => l.situacao === 'Comum às duas');
  if (comuns.length) avisos.push({ nivel: comuns.some((l) => l.nivel === 'critico') ? 'critico' : 'atencao', texto: `${comuns.length} ponto(s) de atenuação comum às duas fibras: ${comuns.map((l) => km(l.km)).join(', ')}. É ali que o cabo está sofrendo.` });
  else avisos.push({ nivel: 'ok', texto: 'Nenhum ponto de atenuação comum às duas fibras: o cabo não mostra esforço; perdas isoladas são de emenda.' });
  // Lances (entre eventos) com atenuação alta nas duas: cabo torcido/tracionado ao longo do lance.
  const lances = (s: Sor) => {
    const ev = s.eventos;
    return ev.map((e, i) => ({ de: i ? ev[i - 1].distanciaKm : 0, ate: e.distanciaKm, a: e.inclinacaoDbKm })).filter((l) => l.a > 0);
  };
  const l1 = lances(f1), l2 = lances(f2);
  const limite = (s: Sor) => (s.comprimentoOndaNm >= 1500 ? 0.3 : 0.45);
  for (const p of l1.filter((l) => l.ate - l.de >= 0.5 && l.a > limite(f1))) {
    const q = l2.find((l) => l.de < p.ate && l.ate > p.de && l.a > limite(f2));
    if (q) avisos.push({ nivel: 'atencao', texto: `Atenuação alta nas duas fibras entre ${km(Math.max(p.de, q.de))} e ${km(Math.min(p.ate, q.ate))} (${dec(p.a)} e ${dec(q.a)} dB/km): cabo tracionado, torcido ou com umidade ao longo do lance.` });
  }
  if (f1.comprimentoOndaNm !== f2.comprimentoOndaNm) avisos.push({ nivel: 'atencao', texto: `Comprimentos de onda diferentes (${f1.comprimentoOndaNm} nm × ${f2.comprimentoOndaNm} nm): compare as duas na mesma onda (1550 nm mostra melhor curvatura).` });
  return resumir({ tipo: 'fibras', comprimento1Km: L1, comprimento2Km: L2, perdaTotal1Db: perdaTotal(f1), perdaTotal2Db: perdaTotal(f2), linhas, avisos });
}

// As duas curvas foram medidas do mesmo lado? Compara quantos eventos batem na mesma distância com e sem espelhar
// e quão parecido é o traço (o espelhado cruza em X quando o sentido é o mesmo).
export function mesmoSentido(a: Sor, b: Sor): boolean {
  const L1 = fimDaFibra(a), L2 = fimDaFibra(b);
  if (!L1 || !L2) return false;
  const tol = tolerancia(a, b), ea = meio(a).map((e) => ({ km: e.distanciaKm, e }));
  const conta = (bb: { km: number; e: EventoSor }[]) => parear(ea, bb, tol).filter((p) => p.x && p.y).length;
  const direto = conta(meio(b).map((e) => ({ km: e.distanciaKm, e })));
  const espelhado = conta(meio(b).map((e) => ({ km: (L2 - e.distanciaKm) * (L1 / L2), e })));
  if (direto !== espelhado) return direto > espelhado;
  // Empate: pelo traço. No mesmo sentido os dois caem juntos (diferença pequena); espelhado, um sobe e o outro desce.
  const t1 = tracoParaComparar(a), t2 = tracoParaComparar(b), t2e = tracoParaComparar(b, { comprimentoKm: L1 });
  const dif = (u: { km: number; db: number }[]) => {
    let soma = 0, n = 0;
    for (const p of t1) { if (p.km < 0.5 || p.km > L1 * 0.9) continue; const q = u.find((x) => x.km >= p.km); if (q) { soma += Math.abs(q.db - p.db); n++; } }
    return n ? soma / n : Infinity;
  };
  return dif(t2) <= dif(t2e);
}

// Traço para sobrepor no gráfico: em dB relativos ao início de cada medição (0 = nível a 0,5 km da ponta onde o OTDR estava);
// o B → A é espelhado nas distâncias de A.
// janela: trecho em km contados de A (para o zoom num evento); sem ela, a fibra toda.
export function tracoParaComparar(s: Sor, espelharEm?: { comprimentoKm: number } | null, janela?: { de: number; ate: number }) {
  const L = fimDaFibra(s) || 1;
  const base = tracoJanela(s, 0, L * 1.03, 700);
  if (!base.length) return [];
  const ref = base.find((p) => p.km >= 0.5)?.db ?? base[0].db;
  const escala = espelharEm ? espelharEm.comprimentoKm / L : 1;
  const de = janela ? (espelharEm ? L - janela.ate / escala : janela.de) : 0;
  const ate = janela ? (espelharEm ? L - janela.de / escala : janela.ate) : L * 1.03;
  const pontos = janela ? tracoJanela(s, Math.max(0, de), ate, 500) : base;
  if (!espelharEm) return pontos.map((p) => ({ km: p.km, db: p.db - ref }));
  // O B → A começa em 0 dB no lado B (direita) e cai na direção de A.
  return pontos.filter((p) => p.km <= L).map((p) => ({ km: (L - p.km) * escala, db: p.db - ref })).reverse();
}

// No mesmo sentido as duas curvas caem juntas e se sobrepõem: a 2ª desce alguns dB para correr em paralelo.
export function deslocamentoParalelo(t1: { db: number }[], t2: { db: number }[]) {
  const dbs = [...t1, ...t2].map((p) => p.db).sort((a, b) => a - b);
  if (!dbs.length) return 0;
  const faixa = dbs[Math.floor(dbs.length * 0.98)] - dbs[Math.floor(dbs.length * 0.02)];
  return -Math.max(1, Math.round(faixa * 0.25));
}
