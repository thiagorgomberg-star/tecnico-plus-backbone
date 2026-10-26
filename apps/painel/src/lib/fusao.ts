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
  // Fibra acesa (ativa), mesmo sem o nome do cliente.
  acesa?: boolean | null;
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

// Linhas da tabela de uma bandeja no relatório: fibra, cores, destino, acesa/apagada e cliente.
export function linhasDaBandeja(caixa: PlanoCaixa, b: { ligacoes: Ligacao[] }) {
  const situacao = new Map((caixa.fibras ?? []).map((f) => [f.fibra, f]));
  const posicoes = caixa.posicoes_dgo ?? {};
  return b.ligacoes.map((l) => {
    const s = situacao.get(l.entrada);
    const capS = caixa.saidas[l.saida - 1] ?? caixa.capacidade_fibras;
    const padraoS = caixa.padrao_cores_saidas?.[l.saida - 1] ?? undefined;
    return {
      fibra: l.entrada,
      entrada: descreverFibra(l.entrada, caixa.capacidade_fibras, caixa.padrao_cores_entrada ?? undefined).replace(/^FO \d+ · /, ''),
      destino: l.saida === 0 ? 'Pigtail no DGO' : `${caixa.tipo === 'dgo' ? 'Cabo' : 'Saída'} ${l.saida} · ${descreverFibra(l.fibraSaida, capS, padraoS)}${l.manobra ? ' (manobra)' : ''}`,
      situacao: s?.sem_potencia ? 'Apagada' : s?.acesa || s?.cliente ? 'Acesa' : '—',
      cliente: s?.cliente ?? '',
      posicao: s?.posicao_dgo || posicoes[l.entrada] || '',
    };
  });
}

// Bandejas: as fusões (em ordem de fibra de entrada) ocupam as bandejas em sequência.
export const FUSOES_POR_BANDEJA = [6, 8, 12, 16, 24];
export type Bandeja = { numero: number; ligacoes: Ligacao[] };

export function separarBandejas(caixa: PlanoCaixa): Bandeja[] {
  const porBandeja = caixa.fusoes_por_bandeja || 12;
  const bandejas: Bandeja[] = [];
  const ligacoes = calcularPlano(caixa).ligacoes;
  // No DGO toda fibra do cabo é fusionada a um pigtail do DIO: as bandejas seguem a ordem das fibras,
  // com ou sem cabo de saída cadastrado (saida 0 = termina no DGO).
  const fusoes = caixa.tipo === 'dgo'
    ? Array.from({ length: caixa.capacidade_fibras }, (_, i) => ligacoes.find((l) => l.entrada === i + 1) ?? { entrada: i + 1, saida: 0, fibraSaida: 0, manobra: false })
    : ligacoes;
  fusoes.forEach((l, i) => {
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

// Desenho no estilo do mapa de fusão: entrada à esquerda, saídas à direita, só os tubos com fusão.
// opcoes.todosTubos: mostra também os tubos de entrada sem fusão (no app, para tocar em qualquer fibra);
// opcoes.alvos: recebe a altura (no desenho) de cada fibra de entrada, para o toque; opcoes.selecionada: destaca a fibra.
export function svgMapaFusao(caixa: PlanoCaixa, opcoes: { todosTubos?: boolean; alvos?: { fibra: number; y: number }[]; selecionada?: number | null } = {}) {
  const { ligacoes, param } = calcularPlano(caixa);
  const bandejas = separarBandejas(caixa);
  const bandejaDe = new Map(bandejas.flatMap((b) => b.ligacoes.map((l) => [l.entrada, b.numero] as const)));
  const L = 16; // altura de cada fibra
  const W = 760;
  const cap = caixa.capacidade_fibras;
  const dgo = caixa.tipo === 'dgo';
  const padraoE = caixa.padrao_cores_entrada || 'abnt';
  const padraoS = (i: number) => caixa.padrao_cores_saidas?.[i] || 'abnt';
  const posicaoDe = new Map<number, string>([
    ...Object.entries(caixa.posicoes_dgo ?? {}).map(([k, v]) => [Number(k), v] as const),
    ...(caixa.fibras ?? []).filter((f) => f.posicao_dgo).map((f) => [f.fibra, f.posicao_dgo!] as const),
  ]);

  // Esquerda: tubos de entrada com alguma fusão.
  const tubosEntrada = opcoes.todosTubos
    ? Array.from({ length: Math.ceil(cap / fibrasPorTubo(cap)) }, (_, i) => i + 1)
    : [...new Set(ligacoes.map((l) => fibra(l.entrada, cap).tubo))].sort((a, b) => a - b);
  const porTuboE = fibrasPorTubo(cap);
  const yEntrada = new Map<number, number>();
  const situacao = new Map((caixa.fibras ?? []).map((f) => [f.fibra, f]));
  const partes: string[] = [];
  let y = 40;
  let bandejaAnterior: number | undefined;
  // No DGO a esquerda são as posições do DGO; nas caixas, o cabo que chega.
  const titulo = dgo ? `DGO · ${cap} posições${localDgo(caixa) ? ` · ${localDgo(caixa)}` : ''}`
    : `Entrada · ${cap} FO${rotuloPadrao(caixa.padrao_cores_entrada) ? ` · ${rotuloPadrao(caixa.padrao_cores_entrada)}` : ''}${caixa.origem ? ` · de ${caixa.origem}` : ''}`;
  partes.push(`<rect x="0" y="4" width="250" height="22" rx="4" fill="#3f3f46"/><text x="10" y="19" fill="#fff" font-size="12" font-weight="bold">${esc(titulo.slice(0, 40))}</text>`);
  for (const t of tubosEntrada) {
    const cor = corDoTubo(t, padraoE);
    partes.push(`<text x="0" y="${y + 10}" font-size="11" font-weight="bold" fill="#374151">${esc(nomeDoTubo(t, padraoE))}</text>`);
    y += 16;
    const primeiro = (t - 1) * porTuboE + 1;
    const qtd = Math.min(porTuboE, cap - primeiro + 1);
    partes.push(`<rect x="0" y="${y}" width="10" height="${qtd * L}" fill="${cor.hex}" stroke="#9ca3af" stroke-width="0.5"/>`);
    for (let k = 0; k < qtd; k++) {
      const n = primeiro + k;
      const f = fibra(n, cap, padraoE);
      const yy = y + k * L + L / 2;
      const bn = bandejaDe.get(n);
      if (bn != null && bn !== bandejaAnterior && bandejaAnterior !== undefined) {
        partes.push(`<line x1="12" y1="${yy - L / 2}" x2="258" y2="${yy - L / 2}" stroke="#0572CE" stroke-dasharray="4 3"/>`);
      }
      if (bn != null && bn !== bandejaAnterior) {
        partes.push(`<text x="262" y="${yy - L / 2 + 3}" font-size="8" fill="#0572CE" font-weight="bold">BANDEJA ${bn}</text>`);
      }
      if (bn != null) bandejaAnterior = bn;
      yEntrada.set(n, yy);
      opcoes.alvos?.push({ fibra: n, y: yy });
      if (opcoes.selecionada === n) partes.push(`<rect x="12" y="${yy - L / 2}" width="214" height="${L}" rx="3" fill="#dbeafe"/>`);
      const usada = ligacoes.some((l) => l.entrada === n);
      partes.push(`<text x="16" y="${yy + 4}" font-size="10" fill="${usada ? '#111827' : '#9ca3af'}">${n}  ${f.corFibra.nome}</text>`);
      const sit = situacao.get(n);
      const pos = posicaoDe.get(n);
      if (sit?.sem_potencia) partes.push(`<text x="92" y="${yy + 4}" font-size="9" fill="#dc2626" font-weight="bold">${pos ? `${esc(pos)} · ` : ''}apagada</text>`);
      else if (sit?.acesa && !sit.cliente && !pos) partes.push(`<text x="92" y="${yy + 4}" font-size="9" fill="#15803d" font-weight="bold">acesa</text>`);
      else if (sit?.cliente || sit?.potencia_dbm != null || pos) {
        const texto = [pos, sit?.cordao_olt ? 'OLT' : null, sit?.cliente?.slice(0, 14),
          sit?.potencia_dbm != null ? `${sit.potencia_dbm} dBm` : null].filter(Boolean).join(' · ').slice(0, 22);
        partes.push(`<text x="92" y="${yy + 4}" font-size="9" fill="${sit?.acesa || sit?.cliente ? '#15803d' : '#1d4ed8'}">${esc(texto)}</text>`);
      }
      partes.push(`<rect x="200" y="${yy - 5}" width="22" height="10" rx="2" fill="${f.corFibra.hex}" stroke="#6b7280" stroke-width="0.5" opacity="${usada ? 1 : 0.35}"/>`);
      if (!usada) partes.push(`<line x1="224" y1="${yy}" x2="234" y2="${yy}" stroke="#9ca3af"/><line x1="234" y1="${yy - 4}" x2="234" y2="${yy + 4}" stroke="#9ca3af"/>`);
    }
    y += qtd * L + 6;
  }
  const alturaEsq = y;

  // Direita: cada saída com os tubos que recebem fusão.
  const ySaida = new Map<string, number>();
  y = 40;
  caixa.saidas.forEach((qtdSaida, i) => {
    const s = i + 1;
    const porTuboS = fibrasPorTubo(qtdSaida);
    const padrao = padraoS(i);
    partes.push(`<rect x="${W - 250}" y="${y - 36 + 4}" width="250" height="22" rx="4" fill="#3f3f46"/><text x="${W - 10}" y="${y - 36 + 19}" fill="#fff" font-size="12" font-weight="bold" text-anchor="end">${dgo ? 'Cabo' : 'Saída'} ${s} · ${qtdSaida} FO${rotuloPadrao(caixa.padrao_cores_saidas?.[i]) ? ` · ${rotuloPadrao(caixa.padrao_cores_saidas?.[i])}` : ''}</text>`);
    const tubos = [...new Set(ligacoes.filter((l) => l.saida === s).map((l) => fibra(l.fibraSaida, qtdSaida).tubo))].sort((a, b) => a - b);
    for (const t of tubos) {
      const cor = corDoTubo(t, padrao);
      partes.push(`<text x="${W}" y="${y + 10}" font-size="11" font-weight="bold" fill="#374151" text-anchor="end">${esc(nomeDoTubo(t, padrao))}</text>`);
      y += 16;
      const primeiro = (t - 1) * porTuboS + 1;
      const qtd = Math.min(porTuboS, qtdSaida - primeiro + 1);
      partes.push(`<rect x="${W - 10}" y="${y}" width="10" height="${qtd * L}" fill="${cor.hex}" stroke="#9ca3af" stroke-width="0.5"/>`);
      for (let k = 0; k < qtd; k++) {
        const n = primeiro + k;
        const f = fibra(n, qtdSaida, padrao);
        const yy = y + k * L + L / 2;
        ySaida.set(`${s}:${n}`, yy);
        const usada = ligacoes.some((l) => l.saida === s && l.fibraSaida === n);
        partes.push(`<rect x="${W - 222}" y="${yy - 5}" width="22" height="10" rx="2" fill="${f.corFibra.hex}" stroke="#6b7280" stroke-width="0.5" opacity="${usada ? 1 : 0.35}"/>`);
        partes.push(`<text x="${W - 16}" y="${yy + 4}" font-size="10" text-anchor="end" fill="${usada ? '#111827' : '#9ca3af'}">${f.corFibra.nome}  ${n}</text>`);
      }
      y += qtd * L + 6;
    }
    y += 40;
  });
  const alturaDir = y - 34;

  // Linhas: cor com cor contínua; manobra tracejada em vermelho com "M" no meio.
  // Etiqueta da bandeja de cada fusão (B1, B2...) logo depois da fibra de entrada; as cores alternam por bandeja.
  const x1 = 262, x2 = W - 224;
  for (const [entrada, b] of bandejaDe) {
    const ya = yEntrada.get(entrada);
    if (ya == null) continue;
    if (!dgo || ligacoes.some((l) => l.entrada === entrada)) partes.push(`<line x1="224" y1="${ya}" x2="${x1}" y2="${ya}" stroke="#4b5563"/>`);
    partes.push(`<rect x="229" y="${ya - 6}" width="28" height="12" rx="3" fill="${b % 2 ? '#0572CE' : '#d97706'}"/><text x="243" y="${ya + 3}" font-size="8" fill="#fff" text-anchor="middle" font-weight="bold">B${b}</text>`);
  }
  for (const l of ligacoes) {
    const ya = yEntrada.get(l.entrada);
    const yb = ySaida.get(`${l.saida}:${l.fibraSaida}`);
    if (ya == null || yb == null) continue;
    const mx = (x1 + x2) / 2;
    const d = ya === yb ? `M${x1},${ya} L${x2},${yb}` : `M${x1},${ya} C${mx},${ya} ${mx},${yb} ${x2},${yb}`;
    if (l.manobra) {
      partes.push(`<path d="${d}" fill="none" stroke="#b91c1c" stroke-width="1.5" stroke-dasharray="5 3"/>`);
      partes.push(`<rect x="${mx - 7}" y="${(ya + yb) / 2 - 8}" width="14" height="16" rx="2" fill="#dc2626"/><text x="${mx}" y="${(ya + yb) / 2 + 4}" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">M</text>`);
    } else {
      partes.push(`<path d="${d}" fill="none" stroke="#4b5563" stroke-width="1"/>`);
    }
  }

  const altura = Math.max(alturaEsq, alturaDir, 60);
  const semPotencia = (caixa.fibras ?? []).filter((f) => f.sem_potencia).length;
  const legenda = `${resumoPadroes(caixa) ? `cores ${resumoPadroes(caixa)} · ` : ''}${cap} fibras · ${ligacoes.length} fusionadas · ${param} param nesta caixa (⊣) · ${caixa.manobras.length} manobra(s) (M, tracejado) ${semPotencia ? ` · ${semPotencia} apagada(s)` : ''} ${` · ${bandejas.length} bandeja(s) de ${caixa.fusoes_por_bandeja || 12} fusões (B)`} · só tubos com fusão`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -20 ${W} ${altura + 20}" width="100%" font-family="sans-serif">` +
    `<text x="0" y="-6" font-size="11" fill="#6b7280">${esc(`Mapa de fusão · ${caixa.identificacao} · ${legenda}`)}</text>${partes.join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// Rastreio da fibra pela rota: da ponta A (DGO ou primeira caixa) até a ponta B,
// seguindo as caixas encadeadas (origem_caixa_id + origem_saida) e as manobras de cada uma.

export type CaixaRede = PlanoCaixa & {
  id: string;
  tipo?: string;
  origem_caixa_id: string | null;
  origem_saida: number | null;
  origem_dgo: string | null;
  origem_tipo?: string | null;
  latitude?: number | null; longitude?: number | null;
  // Marca de metragem impressa no cabo (m): na entrada e em cada saída; reserva técnica enrolada no ponto (m).
  metragem_entrada?: number | null; metragens_saida?: (number | null)[] | null; reserva_m?: number | null;
  // Reservas de cabo encontradas no caminho desde o ponto anterior (ex.: no poste).
  reservas_lance?: ReservaLance[] | null;
  trecho?: string | null; // rota da O.S. em que a caixa foi lançada
};
export type ReservaLance = { metros: number; marca?: number | null; lat?: number | null; lng?: number | null; obs?: string | null };

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

// Cliente informado em alguma caixa do caminho (o mais próximo da ponta A).
export function clienteDoCaminho(passos: PassoRastreio[]) {
  for (const p of passos) {
    const s = p.caixa.fibras?.find((f) => f.fibra === p.fibraEntrada);
    if (s?.cliente || s?.sem_potencia) return s;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Enlace pela metragem do cabo e simulação do local de rompimento pela distância do OTDR.
// A medição é sempre feita numa ponta (DGO ou entroncamento) e anda pelo caminho da fibra.

export type ReservaNoLance = ReservaLance & { pos: number };   // pos: metros de cabo desde o início do lance até a reserva
export type LanceCabo = {
  de: CaixaRede; para: CaixaRede;    // na ordem em que o OTDR "anda"
  metros: number | null;             // comprimento do cabo entre os dois pontos (já com as reservas do caminho)
  fonte: 'cabo' | 'gps' | null;      // cabo: marcas de metragem; gps: linha reta mais as reservas do caminho (estimativa)
  marcaDe: number | null; marcaPara: number | null;
  reservaDe: number;                 // reserva técnica enrolada no ponto de partida do lance
  reservas: ReservaNoLance[];
};

const R_TERRA = 6371000;
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.sqrt(h));
}
const temLocal = (c: { latitude?: number | null; longitude?: number | null }) => c.latitude != null && c.longitude != null;
const somaReservas = (c: CaixaRede) => (c.reservas_lance ?? []).reduce((s, r) => s + (Number(r.metros) || 0), 0);

// Lance entre um ponto (saída) e o seguinte (entrada), no sentido do cabo: diferença das marcas impressas;
// sem as duas marcas, linha reta pelo GPS mais as reservas anotadas no caminho (estimativa).
export function medirLance(anterior: CaixaRede, saida: number, seguinte: CaixaRede) {
  const ms = anterior.metragens_saida?.[saida - 1] ?? null;
  const me = seguinte.metragem_entrada ?? null;
  if (ms != null && me != null) return { metros: Math.abs(me - ms), fonte: 'cabo' as const, marcaSaida: ms, marcaEntrada: me };
  if (temLocal(anterior) && temLocal(seguinte)) {
    const reta = distanciaMetros({ lat: anterior.latitude!, lng: anterior.longitude! }, { lat: seguinte.latitude!, lng: seguinte.longitude! });
    return { metros: Math.round(reta + somaReservas(seguinte)), fonte: 'gps' as const, marcaSaida: ms, marcaEntrada: me };
  }
  return { metros: null, fonte: null, marcaSaida: ms, marcaEntrada: me };
}

// Reservas do caminho em ordem a partir da saída do ponto anterior (posição pela marca do cabo ou, sem ela, pelo GPS).
function reservasEmOrdem(anterior: CaixaRede, seguinte: CaixaRede, metros: number | null, marcaSaida: number | null, invertido: boolean): ReservaNoLance[] {
  const lista = (seguinte.reservas_lance ?? []).filter((r) => Number(r.metros) > 0);
  if (!lista.length || metros == null) return [];
  const reta = Math.max(metros - somaReservas(seguinte), 0);
  const fracaoGps = (r: ReservaLance) => {
    if (r.lat == null || r.lng == null || !temLocal(anterior) || !temLocal(seguinte)) return 0.5;
    const a = distanciaMetros({ lat: anterior.latitude!, lng: anterior.longitude! }, { lat: r.lat, lng: r.lng });
    const b = distanciaMetros({ lat: r.lat, lng: r.lng }, { lat: seguinte.latitude!, lng: seguinte.longitude! });
    return a + b ? a / (a + b) : 0.5;
  };
  const ordenadas = lista.map((r) => ({ r, chave: r.marca != null && marcaSaida != null ? Math.abs(r.marca - marcaSaida) / (metros || 1) : fracaoGps(r) }))
    .sort((a, b) => a.chave - b.chave);
  let antes = 0;
  const comPos = ordenadas.map(({ r, chave }) => {
    const pos = r.marca != null && marcaSaida != null ? Math.abs(r.marca - marcaSaida) : chave * reta + antes;
    antes += Number(r.metros);
    return { ...r, metros: Number(r.metros), pos };
  });
  // No sentido contrário, a reserva começa em (comprimento - fim dela).
  return invertido ? comPos.map((r) => ({ ...r, pos: metros - r.pos - r.metros })).reverse() : comPos;
}

// Lances do caminho da fibra a partir do ponto de medição, para frente (sentido das saídas)
// ou para trás (em direção ao ponto anterior / DGO). Segue as manobras de cada ponto.
export function lancesDoEnlace(caixas: CaixaRede[], inicioId: string, fibraEntrada: number, sentido: 'frente' | 'tras' = 'frente'): LanceCabo[] {
  const { passos } = rastrearFibra(caixas, inicioId, fibraEntrada);
  const i0 = Math.max(passos.findIndex((p) => p.caixa.id === inicioId), 0);
  const pares: [PassoRastreio, PassoRastreio, number][] = [];
  for (let i = 0; i < passos.length - 1; i++) if (passos[i].saida) pares.push([passos[i], passos[i + 1], i]);
  const usados = sentido === 'frente' ? pares.filter(([, , i]) => i >= i0) : pares.filter(([, , i]) => i < i0).reverse();
  return usados.map(([a, b]) => {
    const m = medirLance(a.caixa, a.saida!, b.caixa);
    const tras = sentido === 'tras';
    const de = tras ? b.caixa : a.caixa, para = tras ? a.caixa : b.caixa;
    return {
      de, para, metros: m.metros, fonte: m.fonte,
      marcaDe: tras ? m.marcaEntrada : m.marcaSaida, marcaPara: tras ? m.marcaSaida : m.marcaEntrada,
      reservaDe: de.reserva_m ?? 0,
      reservas: reservasEmOrdem(a.caixa, b.caixa, m.metros, m.marcaSaida, tras),
    };
  });
}

// Sentido padrão da medição: do DGO (ou ponta sem origem) para frente; do entroncamento com origem, de volta para o DGO.
export const sentidoPadrao = (c: CaixaRede): 'frente' | 'tras' => (c.tipo !== 'dgo' && c.origem_caixa_id ? 'tras' : 'frente');

export type Rompimento =
  | { tipo: 'reserva'; caixa: CaixaRede; metrosNaReserva: number; lat: number | null; lng: number | null }
  | { tipo: 'reserva_lance'; lance: LanceCabo; reserva: ReservaNoLance; metrosNaReserva: number; marca: number | null; lat: number | null; lng: number | null }
  | { tipo: 'lance'; lance: LanceCabo; metrosDoInicio: number; metrosAteFim: number; marca: number | null; lat: number | null; lng: number | null }
  | { tipo: 'alem'; ultima: CaixaRede; metrosDepois: number; lat: number | null; lng: number | null }
  | { tipo: 'sem_medida'; lance: LanceCabo };

// Marca impressa no cabo a x metros do início do lance (quando as duas pontas têm marca).
const marcaEm = (l: LanceCabo, x: number) => (l.marcaDe != null && l.marcaPara != null
  ? Math.round(l.marcaDe + Math.sign(l.marcaPara - l.marcaDe) * x) : null);

// Ponto no mapa a x metros de cabo do início do lance: anda entre os pontos com GPS (início, reservas, fim),
// sem contar o cabo enrolado nas reservas.
function pontoNoLance(l: LanceCabo, x: number) {
  type P = { ini: number; fim: number; lat: number; lng: number };
  const pts = [
    { ini: 0, fim: 0, lat: l.de.latitude ?? null, lng: l.de.longitude ?? null },
    ...l.reservas.map((r) => ({ ini: r.pos, fim: r.pos + r.metros, lat: r.lat ?? null, lng: r.lng ?? null })),
    { ini: l.metros ?? 0, fim: l.metros ?? 0, lat: l.para.latitude ?? null, lng: l.para.longitude ?? null },
  ].filter((p): p is P => p.lat != null && p.lng != null);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x >= a.fim && x <= b.ini) {
      const f = b.ini > a.fim ? (x - a.fim) / (b.ini - a.fim) : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
  }
  const perto = pts.reduce<P | null>((m, p) => (!m || Math.abs(p.ini - x) < Math.abs(m.ini - x) ? p : m), null);
  return { lat: perto?.lat ?? null, lng: perto?.lng ?? null };
}

// distanciaKm: distância do evento na curva do OTDR. excessoPct: fibra a mais que o cabo (fibra solta no tubo);
// com 0 a distância do OTDR é tratada como metros de cabo.
export function localizarRompimento(lances: LanceCabo[], distanciaKm: number, excessoPct = 0): Rompimento | null {
  if (!lances.length || !(distanciaKm >= 0)) return null;
  let resta = (distanciaKm * 1000) / (1 + excessoPct / 100);
  for (const l of lances) {
    if (resta <= l.reservaDe) return { tipo: 'reserva', caixa: l.de, metrosNaReserva: resta, lat: l.de.latitude ?? null, lng: l.de.longitude ?? null };
    resta -= l.reservaDe;
    if (l.metros == null) return { tipo: 'sem_medida', lance: l };
    if (resta <= l.metros) {
      const r = l.reservas.find((x) => resta >= x.pos && resta <= x.pos + x.metros);
      if (r) return { tipo: 'reserva_lance', lance: l, reserva: r, metrosNaReserva: resta - r.pos, marca: marcaEm(l, resta), lat: r.lat ?? null, lng: r.lng ?? null };
      return { tipo: 'lance', lance: l, metrosDoInicio: resta, metrosAteFim: l.metros - resta, marca: marcaEm(l, resta), ...pontoNoLance(l, resta) };
    }
    resta -= l.metros;
  }
  const ultima = lances[lances.length - 1].para;
  const reservaFinal = ultima.reserva_m ?? 0;
  if (resta <= reservaFinal) return { tipo: 'reserva', caixa: ultima, metrosNaReserva: resta, lat: ultima.latitude ?? null, lng: ultima.longitude ?? null };
  return { tipo: 'alem', ultima, metrosDepois: resta - reservaFinal, lat: null, lng: null };
}

export const fmtMetros = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`);
const fmtMarca = (m: number) => `${m.toLocaleString('pt-BR')} m`;

export function descreverRompimento(r: Rompimento) {
  if (r.tipo === 'reserva') return `Na reserva técnica de ${r.caixa.identificacao} (${fmtMetros(r.metrosNaReserva)} dentro da reserva)`;
  if (r.tipo === 'reserva_lance') return `Na reserva do caminho entre ${r.lance.de.identificacao} e ${r.lance.para.identificacao}${r.reserva.obs ? ` (${r.reserva.obs})` : ''}: ${fmtMetros(r.metrosNaReserva)} dentro da reserva${r.marca != null ? ` · marca do cabo ≈ ${fmtMarca(r.marca)}` : ''}`;
  if (r.tipo === 'lance') return `Entre ${r.lance.de.identificacao} e ${r.lance.para.identificacao}: ${fmtMetros(r.metrosDoInicio)} depois de ${r.lance.de.identificacao} (${fmtMetros(r.metrosAteFim)} antes de ${r.lance.para.identificacao})${r.marca != null ? ` · marca do cabo ≈ ${fmtMarca(r.marca)}` : ''}${r.lance.fonte === 'gps' ? ' · lance estimado pelo GPS' : ''}`;
  if (r.tipo === 'alem') return `Depois do último ponto cadastrado (${r.ultima.identificacao}): ${fmtMetros(r.metrosDepois)} além dele`;
  return `Falta a metragem do lance ${r.lance.de.identificacao} → ${r.lance.para.identificacao} (e o GPS de um dos pontos)`;
}

// KML com o ponto de medição (DGO / entroncamento) e o ponto estimado do rompimento (Google Earth e apps de mapa).
export function kmlRompimento(r: Rompimento, medicao: CaixaRede, distanciaKm: number, titulo: string) {
  if (r.tipo === 'sem_medida' || r.lat == null || r.lng == null) return null;
  const marca = (nome: string, desc: string, estilo: string, lat: number, lng: number) =>
    `<Placemark><name>${esc(nome)}</name><description>${esc(desc)}</description><styleUrl>#${estilo}</styleUrl>`
    + `<Point><coordinates>${lng.toFixed(7)},${lat.toFixed(7)},0</coordinates></Point></Placemark>`;
  const linha = temLocal(medicao)
    ? `<Placemark><name>OTDR ${String(distanciaKm).replace('.', ',')} km</name><styleUrl>#l</styleUrl><LineString><tessellate>1</tessellate><coordinates>`
      + `${medicao.longitude!.toFixed(7)},${medicao.latitude!.toFixed(7)},0 ${r.lng.toFixed(7)},${r.lat.toFixed(7)},0</coordinates></LineString></Placemark>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titulo)}</name>`
    + `<Style id="r"><IconStyle><color>ff0000ff</color><scale>1.4</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>`
    + `<Style id="m"><IconStyle><color>ffff7f00</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href></Icon></IconStyle></Style>`
    + `<Style id="l"><LineStyle><color>a00000ff</color><width>3</width></LineStyle></Style>`
    + marca(`Possível rompimento (${String(distanciaKm).replace('.', ',')} km)`, `${descreverRompimento(r)}. Medido em ${medicao.identificacao}.`, 'r', r.lat, r.lng)
    + (temLocal(medicao) ? marca(`Medição OTDR: ${medicao.identificacao}`, 'Ponto onde o OTDR foi ligado', 'm', medicao.latitude!, medicao.longitude!) : '')
    + linha + `</Document></kml>`;
}

// Marcas de metragem do cabo anotadas em pontos do caminho (postes da vistoria): com elas o rompimento
// fica entre os dois pontos cujas marcas cercam a marca calculada, bem mais preciso que o lance inteiro.
export type MarcaNoCaminho = { nome: string; lat: number; lng: number; marca: number; reserva?: number | null };
export type RefinoPorMarcas = { lat: number; lng: number; entre: [string, string]; naReserva: string | null };

export function refinarPorMarcas(r: Rompimento, marcas: MarcaNoCaminho[], perto: (p: { lat: number; lng: number }) => boolean): RefinoPorMarcas | null {
  if (r.tipo !== 'lance' || r.marca == null) return null;
  const l = r.lance;
  if (l.marcaDe == null || l.marcaPara == null || !temLocal(l.de) || !temLocal(l.para)) return null;
  const dir = Math.sign(l.marcaPara - l.marcaDe) || 1;
  const pos = (m: number) => (m - l.marcaDe!) * dir;
  const fim = pos(l.marcaPara);
  const meio = marcas.filter((m) => pos(m.marca) > 0 && pos(m.marca) < fim && perto(m));
  if (!meio.length) return null;
  const seq: MarcaNoCaminho[] = [
    { nome: l.de.identificacao, lat: l.de.latitude!, lng: l.de.longitude!, marca: l.marcaDe },
    ...meio.sort((a, b) => pos(a.marca) - pos(b.marca)),
    { nome: l.para.identificacao, lat: l.para.latitude!, lng: l.para.longitude!, marca: l.marcaPara },
  ];
  const alvo = pos(r.marca);
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i], b = seq[i + 1];
    const inicioChao = pos(a.marca) + (i > 0 ? Number(a.reserva) || 0 : 0); // cabo enrolado na reserva do poste
    if (alvo >= pos(a.marca) && alvo < inicioChao) return { lat: a.lat, lng: a.lng, entre: [a.nome, b.nome], naReserva: a.nome };
    if (alvo >= inicioChao && alvo <= pos(b.marca)) {
      const f = pos(b.marca) > inicioChao ? (alvo - inicioChao) / (pos(b.marca) - inicioChao) : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, entre: [a.nome, b.nome], naReserva: null };
    }
  }
  return null;
}

// Pasta de KML com uma linha por lance (ponto anterior → ponto seguinte) e o comprimento no nome:
// pela metragem do cabo quando as duas marcas existem; senão estimado pelo GPS (reta + reservas).
export function kmlLances(caixas: CaixaRede[]) {
  const porId = new Map(caixas.map((c) => [c.id, c]));
  const linhas: string[] = [];
  let total = 0;
  for (const c of caixas) {
    const ant = c.origem_caixa_id ? porId.get(c.origem_caixa_id) : null;
    if (!ant || !temLocal(ant) || !temLocal(c)) continue;
    const m = medirLance(ant, c.origem_saida ?? 1, c);
    if (m.metros != null) total += m.metros;
    const reservas = (c.reservas_lance ?? []).filter((r) => Number(r.metros) > 0);
    const desc = [
      m.metros == null ? 'Sem metragem' : m.fonte === 'cabo' ? `Pela metragem do cabo: marca ${m.marcaSaida} → ${m.marcaEntrada}` : 'Estimado pelo GPS (linha reta + reservas)',
      ant.reserva_m ? `Reserva em ${ant.identificacao}: ${ant.reserva_m} m` : null,
      ...reservas.map((r) => `Reserva no caminho: ${r.metros} m${r.marca != null ? ` (marca ${r.marca})` : ''}${r.obs ? ` · ${r.obs}` : ''}`),
    ].filter(Boolean).map((t) => esc(String(t))).join('<br>');
    const pts = [ant, ...reservas.filter((r) => r.lat != null && r.lng != null).map((r) => ({ latitude: r.lat, longitude: r.lng })), c]
      .map((p) => `${Number(p.longitude).toFixed(7)},${Number(p.latitude).toFixed(7)},0`).join(' ');
    const cor = m.fonte === 'cabo' ? 'ff00c000' : 'ff00a5ff';
    linhas.push(`      <Placemark><name>${esc(`${ant.identificacao} → ${c.identificacao}${m.metros != null ? ` · ${fmtMetros(m.metros)}` : ''}`)}</name>`
      + `<description><![CDATA[${desc}]]></description><Style><LineStyle><color>${cor}</color><width>3</width></LineStyle></Style>`
      + `<LineString><tessellate>1</tessellate><coordinates>${pts}</coordinates></LineString></Placemark>`);
  }
  if (!linhas.length) return '';
  return `    <Folder>\n      <name>${esc(`Lances (${linhas.length}) · ${fmtMetros(total)} de cabo`)}</name>\n${linhas.join('\n')}\n    </Folder>`;
}
