// Plano de fusão de caixa de emenda: código de cores, ligações cor com cor + manobras e o desenho do mapa (SVG).
// Mesmo arquivo em apps/mobile/src/lib/fusao.ts e apps/painel/src/lib/fusao.ts: altere os dois juntos.

export const TIPOS_PONTO = [
  { valor: 'emenda', rotulo: 'Caixa de emenda' },
  { valor: 'entroncamento', rotulo: 'Caixa de entroncamento' },
  { valor: 'dgo', rotulo: 'DGO' },
  { valor: 'site', rotulo: 'Site de parceiro' },
] as const;
export type TipoPonto = (typeof TIPOS_PONTO)[number]['valor'];
export const rotuloPonto = (t: string) => TIPOS_PONTO.find((x) => x.valor === t)?.rotulo ?? 'Caixa';
// Pontas da rede (DGO, entroncamento e site de parceiro): ali se mede sinal e OTDR por fibra.
export const ehPonta = (t: string) => t === 'dgo' || t === 'entroncamento' || t === 'site';
export const INSTALACOES = [{ valor: 'aerea', rotulo: 'Aérea' }, { valor: 'subterranea', rotulo: 'Subterrânea' }] as const;
export const rotuloInstalacao = (t: string | null | undefined) => INSTALACOES.find((x) => x.valor === t)?.rotulo ?? null;

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

export type Manobra = { fibra_entrada: number; saida: number; fibra_saida: number; motivo?: string | null };
export type SituacaoFibra = {
  fibra: number; cliente: string | null; sem_potencia: boolean;
  // Só nas pontas (DGO / entroncamento), medidos com OTDR:
  potencia_dbm?: number | null; reflexao_db?: number | null; perda_db_km?: number | null;
  // Só no DGO: posição da fibra no DGO e potência TX/RX (opcionais).
  posicao_dgo?: string | null; potencia_tx_dbm?: number | null; potencia_rx_dbm?: number | null;
};
export type PlanoCaixa = {
  identificacao: string; capacidade_fibras: number; saidas: number[]; manobras: Manobra[];
  fibras?: SituacaoFibra[]; origem?: string | null; fusoes_por_bandeja?: number | null;
};
export type Ligacao = { entrada: number; saida: number; fibraSaida: number; manobra: boolean };

const fibrasPorTubo = (capacidade: number) => (capacidade < 12 ? capacidade : 12);

export function fibra(n: number, capacidade: number) {
  const porTubo = fibrasPorTubo(capacidade);
  const tubo = Math.ceil(n / porTubo);
  const posicao = ((n - 1) % porTubo) + 1;
  return { tubo, posicao, corTubo: CORES[(tubo - 1) % 12], corFibra: CORES[(posicao - 1) % 12] };
}

// Ex.: "FO 13 · T2 Amarelo / F1 Verde"
export function descreverFibra(n: number, capacidade: number) {
  const f = fibra(n, capacidade);
  return `FO ${n} · T${f.tubo} ${f.corTubo.nome} / F${f.posicao} ${f.corFibra.nome}`;
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
  const { ligacoes } = calcularPlano(anterior);
  const situacao = new Map((anterior.fibras ?? []).map((f) => [f.fibra, f]));
  const fibras: SituacaoFibra[] = [];
  for (const l of ligacoes) {
    if (l.saida !== saida) continue;
    const s = situacao.get(l.entrada);
    if (s && (s.cliente || s.sem_potencia)) fibras.push({ fibra: l.fibraSaida, cliente: s.cliente, sem_potencia: s.sem_potencia });
  }
  return { capacidade, fibras };
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
  const amostra = (hex: string) => `<td bgcolor="${hex}" style="background:${hex};width:10px;border:1px solid #9ca3af">&nbsp;</td>`;
  const linhas = nums.map((n) => {
    const f = fibra(n, caixa.capacidade_fibras);
    const l = destino.get(n);
    const s = situacao.get(n);
    const vai = l ? `Saída ${l.saida} · FO ${l.fibraSaida}${l.manobra ? ' <b style="color:#dc2626">M</b>' : ''}` : 'Termina aqui';
    const estado = s?.sem_potencia ? '<b style="color:#dc2626">Sem potência</b>'
      : s?.cliente ? '<b style="color:#15803d">Ativo</b>' : 'Livre';
    const sinal = [s?.posicao_dgo ? `Pos. ${esc(s.posicao_dgo)}` : null, s?.potencia_dbm != null ? `${s.potencia_dbm} dBm` : null,
      s?.potencia_tx_dbm != null ? `TX ${s.potencia_tx_dbm}` : null, s?.potencia_rx_dbm != null ? `RX ${s.potencia_rx_dbm}` : null]
      .filter(Boolean).map((t) => ` · ${t}`).join('');
    return `<tr>${amostra(f.corTubo.hex)}${amostra(f.corFibra.hex)}<td><b>FO ${n}</b> T${f.tubo}/F${f.posicao}</td>`
      + `<td>${vai}</td><td>${esc(s?.cliente ?? '')}</td><td>${estado}${sinal}</td></tr>`;
  });
  const semCliente = ligacoes.filter((l) => !situacao.has(l.entrada) && !l.manobra).length;
  const resumo = `${ligacoes.length} fusões · ${nums.filter((n) => situacao.get(n)?.cliente && !situacao.get(n)?.sem_potencia).length} ativas`
    + (semCliente ? ` · ${semCliente} fusionadas sem cliente` : '');
  if (!linhas.length) return `<p style="margin:4px 0"><b>Plano de fusão:</b> ${resumo}</p>`;
  return `<p style="margin:6px 0 2px"><b>Plano de fusão</b> · ${resumo}</p>`
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
export function svgMapaFusao(caixa: PlanoCaixa) {
  const { ligacoes, param } = calcularPlano(caixa);
  const bandejas = separarBandejas(caixa);
  const bandejaDe = new Map(bandejas.flatMap((b) => b.ligacoes.map((l) => [l.entrada, b.numero] as const)));
  const L = 16; // altura de cada fibra
  const W = 760;
  const cap = caixa.capacidade_fibras;

  // Esquerda: tubos de entrada com alguma fusão.
  const tubosEntrada = [...new Set(ligacoes.map((l) => fibra(l.entrada, cap).tubo))].sort((a, b) => a - b);
  const porTuboE = fibrasPorTubo(cap);
  const yEntrada = new Map<number, number>();
  const situacao = new Map((caixa.fibras ?? []).map((f) => [f.fibra, f]));
  const partes: string[] = [];
  let y = 40;
  const titulo = `Entrada · ${cap} FO${caixa.origem ? ` · de ${caixa.origem}` : ''}`;
  partes.push(`<rect x="0" y="4" width="250" height="22" rx="4" fill="#3f3f46"/><text x="10" y="19" fill="#fff" font-size="12" font-weight="bold">${esc(titulo.slice(0, 40))}</text>`);
  for (const t of tubosEntrada) {
    const cor = CORES[(t - 1) % 12];
    partes.push(`<text x="0" y="${y + 10}" font-size="11" font-weight="bold" fill="#374151">Tubo ${t} · ${cor.nome}</text>`);
    y += 16;
    const primeiro = (t - 1) * porTuboE + 1;
    const qtd = Math.min(porTuboE, cap - primeiro + 1);
    partes.push(`<rect x="0" y="${y}" width="10" height="${qtd * L}" fill="${cor.hex}" stroke="#9ca3af" stroke-width="0.5"/>`);
    for (let k = 0; k < qtd; k++) {
      const n = primeiro + k;
      const f = fibra(n, cap);
      const yy = y + k * L + L / 2;
      yEntrada.set(n, yy);
      const usada = ligacoes.some((l) => l.entrada === n);
      partes.push(`<text x="16" y="${yy + 4}" font-size="10" fill="${usada ? '#111827' : '#9ca3af'}">${n}  ${f.corFibra.nome}</text>`);
      const sit = situacao.get(n);
      if (sit?.sem_potencia) partes.push(`<text x="92" y="${yy + 4}" font-size="9" fill="#dc2626" font-weight="bold">sem potência</text>`);
      else if (sit?.cliente || sit?.potencia_dbm != null) {
        const texto = [sit.cliente?.slice(0, 14), sit.potencia_dbm != null ? `${sit.potencia_dbm} dBm` : null].filter(Boolean).join(' · ');
        partes.push(`<text x="92" y="${yy + 4}" font-size="9" fill="#1d4ed8">${esc(texto)}</text>`);
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
    partes.push(`<rect x="${W - 250}" y="${y - 36 + 4}" width="250" height="22" rx="4" fill="#3f3f46"/><text x="${W - 10}" y="${y - 36 + 19}" fill="#fff" font-size="12" font-weight="bold" text-anchor="end">Saída ${s} · ${qtdSaida} FO</text>`);
    const tubos = [...new Set(ligacoes.filter((l) => l.saida === s).map((l) => fibra(l.fibraSaida, qtdSaida).tubo))].sort((a, b) => a - b);
    for (const t of tubos) {
      const cor = CORES[(t - 1) % 12];
      partes.push(`<text x="${W}" y="${y + 10}" font-size="11" font-weight="bold" fill="#374151" text-anchor="end">Tubo ${t} · ${cor.nome}</text>`);
      y += 16;
      const primeiro = (t - 1) * porTuboS + 1;
      const qtd = Math.min(porTuboS, qtdSaida - primeiro + 1);
      partes.push(`<rect x="${W - 10}" y="${y}" width="10" height="${qtd * L}" fill="${cor.hex}" stroke="#9ca3af" stroke-width="0.5"/>`);
      for (let k = 0; k < qtd; k++) {
        const n = primeiro + k;
        const f = fibra(n, qtdSaida);
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
    partes.push(`<line x1="224" y1="${ya}" x2="${x1}" y2="${ya}" stroke="#4b5563"/>`);
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
  const legenda = `${cap} fibras · ${ligacoes.length} fusionadas · ${param} param nesta caixa (⊣) · ${caixa.manobras.length} manobra(s) (M, tracejado) ${semPotencia ? ` · ${semPotencia} sem potência` : ''} · ${bandejas.length} bandeja(s) de ${caixa.fusoes_por_bandeja || 12} fusões (B) · só tubos com fusão`;
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
  const pontaA = atual.origem_dgo ? `DGO ${atual.origem_dgo}` : null;

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
