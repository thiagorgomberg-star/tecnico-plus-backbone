// Plano de fusão de caixa de emenda: código de cores, ligações cor com cor + manobras e o desenho do mapa (SVG).
// Mesmo arquivo em apps/mobile/src/lib/fusao.ts e apps/painel/src/lib/fusao.ts: altere os dois juntos.

export const TIPOS_PONTO = [
  { valor: 'emenda', rotulo: 'Caixa de emenda' },
  { valor: 'entroncamento', rotulo: 'Caixa de entroncamento' },
  { valor: 'dgo', rotulo: 'DGO' },
  { valor: 'site', rotulo: 'Site de parceiro' },
] as const;
export type TipoPonto = (typeof TIPOS_PONTO)[number]['valor'];
// Caixa de emenda pode ser do tipo swap (troca de cabo): continua 'emenda', com a marca `swap`.
export const rotuloPonto = (t: string, swap?: boolean | null) =>
  (TIPOS_PONTO.find((x) => x.valor === t)?.rotulo ?? 'Caixa') + (swap && t === 'emenda' ? ' swap' : '');
// Para onde vai cada saída, mesmo quando o ponto seguinte ainda não está cadastrado.
export const TIPOS_DESTINO = [
  { valor: 'emenda', rotulo: 'Caixa de emenda' },
  { valor: 'swap', rotulo: 'Emenda swap' },
  { valor: 'entroncamento', rotulo: 'Entroncamento' },
  { valor: 'dgo', rotulo: 'DGO' },
  { valor: 'site', rotulo: 'Site de parceiro' },
] as const;
export type Destino = { tipo: string; nome: string | null };
export const rotuloDestino = (d: Destino | null | undefined) =>
  d ? [TIPOS_DESTINO.find((x) => x.valor === d.tipo)?.rotulo ?? d.tipo, d.nome].filter(Boolean).join(' ') : '';
// Origem que não está cadastrada no sistema: tipo + nome (registros antigos sem tipo eram DGO).
export const origemNaoCadastrada = (c: { origem_dgo?: string | null; origem_tipo?: string | null }) =>
  c.origem_dgo ? rotuloDestino({ tipo: c.origem_tipo || 'dgo', nome: c.origem_dgo }) : '';
// "Saída 1: 12 FO → Entroncamento ENT-BKB-0001, Saída 2: 12 FO"
export const descreverSaidas = (c: { saidas: number[]; destinos?: (Destino | null)[] | null }) =>
  c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO${c.destinos?.[i] ? ` → ${rotuloDestino(c.destinos[i])}` : ''}`).join(', ');
// Pontas da rede (DGO, entroncamento e site de parceiro): ali se mede sinal e OTDR por fibra.
export const ehPonta = (t: string) => t === 'dgo' || t === 'entroncamento' || t === 'site';
// Instalação: caixa aérea/subterrânea; DGO em container, rooftop ou em site de outro parceiro (nome em `parceiro`).
export const INSTALACOES = [{ valor: 'aerea', rotulo: 'Aérea' }, { valor: 'subterranea', rotulo: 'Subterrânea' }] as const;
export const INSTALACOES_DGO = [
  { valor: 'container', rotulo: 'Container' },
  { valor: 'rooftop', rotulo: 'Rooftop' },
  { valor: 'site_parceiro', rotulo: 'Site de outro parceiro' },
] as const;
export const instalacoesDoTipo = (tipo: string) =>
  tipo === 'dgo' ? INSTALACOES_DGO : tipo === 'emenda' || tipo === 'entroncamento' ? INSTALACOES : [];
export const rotuloInstalacao = (t: string | null | undefined) =>
  [...INSTALACOES, ...INSTALACOES_DGO].find((x) => x.valor === t)?.rotulo ?? null;

export const CAPACIDADES = [6, 12, 24, 36, 48, 72, 96, 144, 288];

// Código de cores de fibras e tubos (padrão ABNT).
export const CORES = [
  { nome: 'Verde', hex: '#16a34a' },
  { nome: 'Amarelo', hex: '#eab308' },
  { nome: 'Branco', hex: '#ffffff' },
  { nome: 'Azul', hex: '#1d4ed8' },
  { nome: 'Vermelho', hex: '#dc2626' },
  { nome: 'Violeta', hex: '#7c3aed' },
  { nome: 'Marrom', hex: '#7c2d12' },
  { nome: 'Rosa', hex: '#f472b6' },
  { nome: 'Preto', hex: '#111827' },
  { nome: 'Cinza', hex: '#6b7280' },
  { nome: 'Laranja', hex: '#ea580c' },
  { nome: 'Azul-claro', hex: '#22d3ee' },
];

// Padrões de cores dos cabos. Pelo caminho podem se misturar (ex.: entrada brasileira, saída americana).
// Brasileiro (ABNT) é o padrão; o cabo de 288 FO costuma ser "cabo coroa".
export const CORES_EIA = [
  { nome: 'Azul', hex: '#1d4ed8' },
  { nome: 'Laranja', hex: '#ea580c' },
  { nome: 'Verde', hex: '#16a34a' },
  { nome: 'Marrom', hex: '#7c2d12' },
  { nome: 'Cinza', hex: '#6b7280' },
  { nome: 'Branco', hex: '#ffffff' },
  { nome: 'Vermelho', hex: '#dc2626' },
  { nome: 'Preto', hex: '#111827' },
  { nome: 'Amarelo', hex: '#eab308' },
  { nome: 'Violeta', hex: '#7c3aed' },
  { nome: 'Rosa', hex: '#f472b6' },
  { nome: 'Água', hex: '#22d3ee' },
];
export const PADROES_CORES = [
  { valor: 'abnt', rotulo: 'Brasileiro', curto: 'BR' },
  { valor: 'eia', rotulo: 'Americano', curto: 'EUA' },
  { valor: 'coroa', rotulo: 'Cabo coroa', curto: 'Coroa' },
] as const;
export type PadraoCores = (typeof PADROES_CORES)[number]['valor'];
// Sem padrão informado pelo técnico não se mostra nada (o desenho usa as cores brasileiras só para ilustrar).
export const rotuloPadrao = (p: string | null | undefined) => PADROES_CORES.find((x) => x.valor === p)?.rotulo ?? null;
// Cabo coroa (288 FO): tubos em coroas de 12, contados a partir do tubo piloto (verde) no sentido do direcional (amarelo);
// os demais tubos são naturais. As fibras de cada tubo seguem o código brasileiro.
const TUBOS_POR_COROA = 12;
const NATURAL = { nome: 'Natural', hex: '#f5f5dc' };
// Padrão de cada cabo da caixa: entrada e cada saída. "BR × EUA" quando a caixa liga padrões diferentes.
// Por extenso, para o relatório: "Entrada: Brasileiro · Saída 1: Americano · Saída 2: Brasileiro".
export function padroesPorExtenso(c: { tipo?: string; padrao_cores_entrada?: string | null; padrao_cores_saidas?: (string | null)[] | null; saidas: number[] }) {
  const partes: string[] = [];
  if (c.tipo !== 'dgo' && rotuloPadrao(c.padrao_cores_entrada)) partes.push(`Entrada: ${rotuloPadrao(c.padrao_cores_entrada)}`);
  c.saidas.forEach((_, i) => {
    const r = rotuloPadrao(c.padrao_cores_saidas?.[i]);
    if (r) partes.push(`${c.tipo === 'dgo' ? 'Cabo' : 'Saída'} ${i + 1}: ${r}`);
  });
  return partes.join(' · ');
}
export function resumoPadroes(c: { padrao_cores_entrada?: string | null; padrao_cores_saidas?: (string | null)[] | null; saidas: number[] }) {
  const curto = (p: string | null | undefined) => PADROES_CORES.find((x) => x.valor === p)?.curto ?? '?';
  const saidas = c.saidas.map((_, i) => c.padrao_cores_saidas?.[i]).filter(Boolean);
  if (!c.padrao_cores_entrada && !saidas.length) return '';
  return saidas.length ? `${curto(c.padrao_cores_entrada)} × ${[...new Set(saidas.map(curto))].join('/')}` : curto(c.padrao_cores_entrada);
}

export type Manobra = { fibra_entrada: number; saida: number; fibra_saida: number; motivo?: string | null };
export type SituacaoFibra = {
  fibra: number; cliente: string | null; sem_potencia: boolean;
  // Só nas pontas (DGO / entroncamento), medidos com OTDR:
  potencia_dbm?: number | null; reflexao_db?: number | null; perda_db_km?: number | null;
  // Só no DGO: posição da fibra no DGO e potência TX/RX (opcionais).
  posicao_dgo?: string | null; potencia_tx_dbm?: number | null; potencia_rx_dbm?: number | null;
  // Fibra com cordão até a OLT instalada no DGO: posição na OLT e SFP; potencia_tx_dbm é a potência na saída da OLT.
  cordao_olt?: boolean | null; olt_posicao?: string | null; sfp_tipo?: string | null;
  cordao_tipo?: string | null; olt_modelo?: string | null; sfp_modelo?: string | null;
};

// Conectores do cordão OLT ↔ DGO (para a manutenção levar o cordão certo).
// Sugestões de modelo de OLT; o técnico pode digitar outro.
export const MODELOS_OLT = ['Huawei MA5800-X7', 'Huawei MA5800-X15', 'Huawei MA5608T', 'ZTE C300', 'ZTE C600', 'Nokia ISAM FX', 'Fiberhome AN5516'];
export const TIPOS_SFP = ['B+', 'C+', 'C++', 'XGS-PON N1', '10G LR', '10G ER'];
export const TIPOS_CORDAO = ['SC/APC', 'SC/UPC', 'LC/APC', 'LC/UPC', 'E2000/APC', 'FC/APC', 'FC/UPC'];
// Ex.: "OLT Huawei MA5800 · slot 2 PON 5 · SFP C+ · cordão SC/APC"
export const descreverOlt = (f: SituacaoFibra) => (f.cordao_olt
  ? [`OLT${f.olt_modelo ? ` ${f.olt_modelo}` : ''}`, f.olt_posicao, f.sfp_tipo || f.sfp_modelo ? `SFP ${[f.sfp_tipo, f.sfp_modelo].filter(Boolean).join(' ')}` : null, f.cordao_tipo ? `cordão ${f.cordao_tipo}` : null]
    .filter(Boolean).join(' · ')
  : '');
// Onde o DGO fica na sala (todos opcionais): "Fila 3 · Rack 12 · Bastidor B03".
export const localDgo = (c: { fila?: string | null; rack?: string | null; bastidor?: string | null }) =>
  [c.fila && `Fila ${c.fila}`, c.rack && `Rack ${c.rack}`, c.bastidor && `Bastidor ${c.bastidor}`].filter(Boolean).join(' · ');
export type PlanoCaixa = {
  identificacao: string; capacidade_fibras: number; saidas: number[]; manobras: Manobra[];
  fibras?: SituacaoFibra[]; origem?: string | null; fusoes_por_bandeja?: number | null;
  tipo?: string; bastidor?: string | null; fila?: string | null; rack?: string | null;
  swap?: boolean | null; destinos?: (Destino | null)[] | null;
  padrao_cores_entrada?: string | null; padrao_cores_saidas?: (string | null)[] | null;
  // Posição no DGO de cada fibra de entrada, achada seguindo o cabo de volta até o DGO (ver posicoesDgo).
  posicoes_dgo?: Record<number, string>;
};
export type Ligacao = { entrada: number; saida: number; fibraSaida: number; manobra: boolean };

const fibrasPorTubo = (capacidade: number) => (capacidade < 12 ? capacidade : 12);

export function corDoTubo(tubo: number, padrao: string = 'abnt') {
  if (padrao === 'eia') return CORES_EIA[(tubo - 1) % 12];
  if (padrao === 'coroa') {
    const pos = ((tubo - 1) % TUBOS_POR_COROA) + 1;
    return pos === 1 ? { nome: 'Piloto verde', hex: CORES[0].hex } : pos === 2 ? { nome: 'Direcional amarelo', hex: CORES[1].hex } : NATURAL;
  }
  return CORES[(tubo - 1) % 12];
}
// Nome do tubo no mapa: "Tubo 3 · Branco"; no cabo coroa "Coroa 2 · Tubo 1 · Piloto verde".
export function nomeDoTubo(tubo: number, padrao: string = 'abnt') {
  if (padrao === 'coroa') {
    const coroa = Math.ceil(tubo / TUBOS_POR_COROA);
    return `Coroa ${coroa} · Tubo ${((tubo - 1) % TUBOS_POR_COROA) + 1} · ${corDoTubo(tubo, padrao).nome}`;
  }
  return `Tubo ${tubo} · ${corDoTubo(tubo, padrao).nome}`;
}

export function fibra(n: number, capacidade: number, padrao: string = 'abnt') {
  const porTubo = fibrasPorTubo(capacidade);
  const tubo = Math.ceil(n / porTubo);
  const posicao = ((n - 1) % porTubo) + 1;
  const corFibra = padrao === 'eia' ? CORES_EIA[(posicao - 1) % 12] : CORES[(posicao - 1) % 12];
  return { tubo, posicao, corTubo: corDoTubo(tubo, padrao), corFibra };
}

// Ex.: "FO 13 · T2 Amarelo / F1 Verde"
export function descreverFibra(n: number, capacidade: number, padrao: string = 'abnt') {
  const f = fibra(n, capacidade, padrao);
  const tubo = padrao === 'coroa' ? `C${Math.ceil(f.tubo / TUBOS_POR_COROA)} T${((f.tubo - 1) % TUBOS_POR_COROA) + 1}` : `T${f.tubo}`;
  return `FO ${n} · ${tubo} ${f.corTubo.nome} / F${f.posicao} ${f.corFibra.nome}`;
}

// Cor com cor em sequência pelas saídas (Saída 1 recebe as primeiras fibras, a Saída 2 as seguintes...);
// as manobras substituem o destino da fibra de entrada e ocupam a fibra de saída indicada.
export function calcularPlano(caixa: PlanoCaixa) {
  const ocupadas = new Set(caixa.manobras.map((m) => `${m.saida}:${m.fibra_saida}`));
  const manobradas = new Map(caixa.manobras.map((m) => [m.fibra_entrada, m]));
  const ligacoes: Ligacao[] = [];
  let inicio = 0;
  caixa.saidas.forEach((qtd, i) => {
    for (let f = 1; f <= qtd; f++) {
      const entrada = inicio + f;
      if (entrada > caixa.capacidade_fibras || manobradas.has(entrada) || ocupadas.has(`${i + 1}:${f}`)) continue;
      ligacoes.push({ entrada, saida: i + 1, fibraSaida: f, manobra: false });
    }
    inicio += qtd;
  });
  for (const m of caixa.manobras) {
    if (m.fibra_entrada <= caixa.capacidade_fibras && m.saida <= caixa.saidas.length && m.fibra_saida <= caixa.saidas[m.saida - 1]) {
      ligacoes.push({ entrada: m.fibra_entrada, saida: m.saida, fibraSaida: m.fibra_saida, manobra: true });
    }
  }
  ligacoes.sort((a, b) => a.entrada - b.entrada);

  const porTubo = fibrasPorTubo(caixa.capacidade_fibras);
  const totalTubos = Math.ceil(caixa.capacidade_fibras / porTubo);
  const tubosFusionados = new Set(ligacoes.map((l) => fibra(l.entrada, caixa.capacidade_fibras).tubo));
  return {
    ligacoes,
    param: caixa.capacidade_fibras - ligacoes.length,
    totalTubos,
    gruposFusionados: tubosFusionados.size,
    gruposVagos: totalTubos - tubosFusionados.size,
  };
}

// Bandejas: as fusões (em ordem de fibra de entrada) ocupam as bandejas em sequência.
export const FUSOES_POR_BANDEJA = [6, 8, 12, 16, 24];
export type Bandeja = { numero: number; ligacoes: Ligacao[] };

export function separarBandejas(caixa: PlanoCaixa): Bandeja[] {
  const porBandeja = caixa.fusoes_por_bandeja || 12;
  const bandejas: Bandeja[] = [];
  calcularPlano(caixa).ligacoes.forEach((l, i) => {
    const b = Math.floor(i / porBandeja);
    if (!bandejas[b]) bandejas[b] = { numero: b + 1, ligacoes: [] };
    bandejas[b].ligacoes.push(l);
  });
  return bandejas;
}

// Ex.: "FO 1–12, 37" (fibras de entrada da bandeja, em faixas).
export function faixasDaBandeja(b: Bandeja) {
  const nums = b.ligacoes.map((l) => l.entrada);
  const faixas: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    faixas.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j;
  }
  return `FO ${faixas.join(', ')}`;
}

// Caixa nova a partir da saída de outra: a entrada é aquele cabo, e cliente/sem potência acompanham a fibra.
export function herdarDaAnterior(anterior: PlanoCaixa, saida: number) {
  const capacidade = anterior.saidas[saida - 1] ?? 0;
  const padrao = anterior.padrao_cores_saidas?.[saida - 1] || null;
  const { ligacoes } = calcularPlano(anterior);
  const situacao = new Map((anterior.fibras ?? []).map((f) => [f.fibra, f]));
  const fibras: SituacaoFibra[] = [];
  for (const l of ligacoes) {
    if (l.saida !== saida) continue;
    const s = situacao.get(l.entrada);
    if (s && (s.cliente || s.sem_potencia)) fibras.push({ fibra: l.fibraSaida, cliente: s.cliente, sem_potencia: s.sem_potencia });
  }
  return { capacidade, fibras, padrao };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Prévia do plano de fusão para o balão do pin no KMZ (HTML simples, que o Google Earth e o My Maps mostram):
// as fibras com cliente/parceiro ou manobra, com as cores, para onde vão nesta caixa e a situação.
export function htmlPreviaPlano(caixa: PlanoCaixa) {
  const { ligacoes } = calcularPlano(caixa);
  const destino = new Map(ligacoes.map((l) => [l.entrada, l]));
  const situacao = new Map((caixa.fibras ?? []).map((f) => [f.fibra, f]));
  const nums = [...new Set([...situacao.keys(), ...ligacoes.filter((l) => l.manobra).map((l) => l.entrada)])]
    .filter((n) => n <= caixa.capacidade_fibras).sort((a, b) => a - b);
  const padrao = caixa.padrao_cores_entrada || 'abnt';
  const amostra = (hex: string) => `<td bgcolor="${hex}" style="background:${hex};width:10px;border:1px solid #9ca3af">&nbsp;</td>`;
  const linhas = nums.map((n) => {
    const f = fibra(n, caixa.capacidade_fibras, padrao);
    const l = destino.get(n);
    const s = situacao.get(n);
    const vai = l ? `Saída ${l.saida} · FO ${l.fibraSaida}${l.manobra ? ' <b style="color:#dc2626">M</b>' : ''}` : 'Termina aqui';
    const estado = s?.sem_potencia ? '<b style="color:#dc2626">Sem potência</b>'
      : s?.cliente ? '<b style="color:#15803d">Ativo</b>' : 'Livre';
    const posDgo = s?.posicao_dgo || caixa.posicoes_dgo?.[n];
    const sinal = [posDgo ? `DGO ${esc(posDgo)}` : null, s?.potencia_dbm != null ? `${s.potencia_dbm} dBm` : null,
      s?.cordao_olt ? esc(descreverOlt(s)) : null,
      s?.potencia_tx_dbm != null ? `${s?.cordao_olt ? 'Saída OLT' : 'TX'} ${s.potencia_tx_dbm}` : null, s?.potencia_rx_dbm != null ? `RX ${s.potencia_rx_dbm}` : null]
      .filter(Boolean).map((t) => ` · ${t}`).join('');
    return `<tr>${amostra(f.corTubo.hex)}${amostra(f.corFibra.hex)}<td><b>FO ${n}</b> ${padrao === 'coroa' ? `C${Math.ceil(f.tubo / TUBOS_POR_COROA)}/` : ''}T${padrao === 'coroa' ? ((f.tubo - 1) % TUBOS_POR_COROA) + 1 : f.tubo}/F${f.posicao}</td>`
      + `<td>${vai}</td><td>${esc(s?.cliente ?? '')}</td><td>${estado}${sinal}</td></tr>`;
  });
  const semCliente = ligacoes.filter((l) => !situacao.has(l.entrada) && !l.manobra).length;
  const resumo = `${ligacoes.length} fusões · ${nums.filter((n) => situacao.get(n)?.cliente && !situacao.get(n)?.sem_potencia).length} ativas`
    + (semCliente ? ` · ${semCliente} fusionadas sem cliente` : '');
  if (!linhas.length) return `<p style="margin:4px 0"><b>Plano de fusão:</b> ${resumo}</p>`;
  return `<p style="margin:6px 0 2px"><b>Plano de fusão</b> · ${resumo}${resumoPadroes(caixa) ? ` · cores ${resumoPadroes(caixa)}` : ''}</p>`
    + '<table cellpadding="2" cellspacing="0" border="0" style="font-size:11px;border-collapse:collapse">'
    + '<tr style="color:#6b7280"><td>T</td><td>F</td><td>Fibra entrada</td><td>Vai para</td><td>Cliente / parceiro</td><td>Situação</td></tr>'
    + linhas.join('') + '</table>';
}

// Fotos da caixa no pin: o Google Earth só mostra imagem por link (não aceita arquivo dentro do KMZ),
// então vão como link longo do servidor nas mídias do pin (gx_media_links); o balão fica só com os dados.
export type FotoKmz = { url: string; legenda: string };
export const midiasKmz = (fotos: FotoKmz[]) => (fotos.length
  ? `<ExtendedData><Data name="gx_media_links"><value>${fotos.map((f) => f.url.replace(/&/g, '&amp;')).join(' ')}</value></Data></ExtendedData>`
  : '');
// Validade dos links das fotos no KMZ (10 anos): o arquivo pode ser compartilhado e aberto muito depois.
export const VALIDADE_LINK_FOTO_KMZ = 10 * 365 * 24 * 3600;

// ---------------------------------------------------------------------------
// Rastreio da fibra pela rota: da ponta A (DGO ou primeira caixa) até a ponta B,
// seguindo as caixas encadeadas (origem_caixa_id + origem_saida) e as manobras de cada uma.
// (Cópia da função backup-drive: sem o desenho SVG do mapa de fusão, que o KMZ não usa.)

export type CaixaRede = PlanoCaixa & {
  id: string;
  tipo?: string;
  origem_caixa_id: string | null;
  origem_saida: number | null;
  origem_dgo: string | null;
  origem_tipo?: string | null;
};

export type PassoRastreio = {
  caixa: CaixaRede;
  fibraEntrada: number;
  saida: number | null;      // null: a fibra para nesta caixa
  fibraSaida: number | null;
  manobra: boolean;
  motivo: string | null;
};

export function rastrearFibra(caixas: CaixaRede[], caixaId: string, fibraEntrada: number) {
  const porId = new Map(caixas.map((c) => [c.id, c]));
  const planos = new Map<string, Ligacao[]>();
  const ligacoesDe = (c: CaixaRede) => {
    if (!planos.has(c.id)) planos.set(c.id, calcularPlano(c).ligacoes);
    return planos.get(c.id)!;
  };
  const passo = (c: CaixaRede, e: number): PassoRastreio => {
    const l = ligacoesDe(c).find((x) => x.entrada === e);
    const m = c.manobras.find((x) => x.fibra_entrada === e);
    return { caixa: c, fibraEntrada: e, saida: l?.saida ?? null, fibraSaida: l?.fibraSaida ?? null, manobra: !!l?.manobra, motivo: m?.motivo ?? null };
  };

  const inicio = porId.get(caixaId);
  if (!inicio) return { passos: [] as PassoRastreio[], pontaA: null as string | null };

  // Para trás até a ponta A.
  const antes: PassoRastreio[] = [];
  let atual = inicio;
  let fibraAtual = fibraEntrada;
  const visitadas = new Set([atual.id]);
  while (atual.origem_caixa_id && atual.origem_saida) {
    const anterior = porId.get(atual.origem_caixa_id);
    if (!anterior || visitadas.has(anterior.id)) break;
    const l = ligacoesDe(anterior).find((x) => x.saida === atual.origem_saida && x.fibraSaida === fibraAtual);
    if (!l) break;
    antes.unshift(passo(anterior, l.entrada));
    visitadas.add(anterior.id);
    atual = anterior;
    fibraAtual = l.entrada;
  }
  const pontaA = origemNaoCadastrada(atual) || null;

  // Para frente até a ponta B.
  const depois: PassoRastreio[] = [passo(inicio, fibraEntrada)];
  let p = depois[0];
  while (p.saida && p.fibraSaida) {
    const proxima = caixas.find((c) => c.origem_caixa_id === p.caixa.id && c.origem_saida === p.saida && !visitadas.has(c.id));
    if (!proxima) break;
    visitadas.add(proxima.id);
    p = passo(proxima, p.fibraSaida);
    depois.push(p);
  }
  return { passos: [...antes, ...depois], pontaA };
}

// Posição no DGO de cada fibra de entrada da caixa: segue o cabo de volta pelas caixas encadeadas até o DGO
// (caixa de abordagem e as demais do trajeto). Só acha quando o DGO está cadastrado como ponto da rede.
export function posicoesDgo(caixas: CaixaRede[], caixa: CaixaRede): Record<number, string> {
  const resultado: Record<number, string> = {};
  if (caixa.tipo === 'dgo' || !caixa.origem_caixa_id) return resultado;
  const fibras = new Set([...calcularPlano(caixa).ligacoes.map((l) => l.entrada), ...(caixa.fibras ?? []).map((f) => f.fibra)]);
  for (const n of fibras) {
    const [primeiro] = rastrearFibra(caixas, caixa.id, n).passos;
    if (!primeiro || primeiro.caixa.id === caixa.id || primeiro.caixa.tipo !== 'dgo') continue;
    const pos = primeiro.caixa.fibras?.find((f) => f.fibra === primeiro.fibraEntrada)?.posicao_dgo;
    if (pos) resultado[n] = pos;
  }
  return resultado;
}
