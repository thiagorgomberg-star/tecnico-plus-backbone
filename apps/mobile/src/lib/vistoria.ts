import AsyncStorage from '@react-native-async-storage/async-storage';

import { enfileirar } from './fila';
import { ponto, supabase } from './supabase';

// Vistoria Backbone (MG e SP): postes e ocorrências registrados ao longo da rota (funciona offline; a fila envia depois).
export const VISTORIA_MG = 'Vistoria Backbone MG';
export const VISTORIA_SP = 'Vistoria Backbone SP';
export const ehVistoria = (tipo: string) => tipo === VISTORIA_MG || tipo === VISTORIA_SP;

// Trechos do Sul de Minas para escolher ao abrir a vistoria (o código BB-xx soma a produção por trecho no painel).
export const TRECHOS_MG = [
  'BB-08 · Campos do Jordão × Itajubá',
  'BB-09 · Itajubá × Maria da Fé',
  'BB-10 · Carmo de Minas × São Lourenço',
  'BB-11 · Maria da Fé × Carmo de Minas',
  'BB-12 · Carmo de Minas × Lambari',
  'BB-13 · Lambari × Heliodora × Careaçu',
  'BB-14 · Pedralva × Santa Rita do Sapucaí',
  'BB-15 · Santa Rita do Sapucaí × Pouso Alegre',
];

// Trechos de São Paulo (Vale do Paraíba e capital).
export const TRECHOS_SP = [
  'SJC · São José dos Campos',
  'Taubaté',
  'SP · São Paulo',
];

export const TRECHOS_VISTORIA: Record<string, { regiao: string; trechos: string[] }> = {
  [VISTORIA_MG]: { regiao: 'Minas', trechos: TRECHOS_MG },
  [VISTORIA_SP]: { regiao: 'São Paulo', trechos: TRECHOS_SP },
};

export type Opcao = { valor: string; rotulo: string };

export const MATERIAIS: Opcao[] = [
  { valor: 'madeira', rotulo: 'Madeira' }, { valor: 'eucalipto_tratado', rotulo: 'Eucalipto tratado' },
  { valor: 'concreto', rotulo: 'Concreto' }, { valor: 'metalico', rotulo: 'Metálico' }, { valor: 'outro', rotulo: 'Outro' },
];
export const ESTADOS_BASE: Opcao[] = [
  { valor: 'ok', rotulo: 'Base OK' }, { valor: 'podre', rotulo: 'Podre' }, { valor: 'cupim', rotulo: 'Cupim' }, { valor: 'erosao', rotulo: 'Erosão no pé' },
];
export const ESTAIS: Opcao[] = [
  { valor: 'ok', rotulo: 'OK' }, { valor: 'frouxo', rotulo: 'Frouxo' }, { valor: 'ausente', rotulo: 'Faltando' }, { valor: 'nao_tem', rotulo: 'Não precisa' },
];
export const TIPOS_VIA: Opcao[] = [
  { valor: 'rodovia_federal', rotulo: 'Rodovia federal (DNIT)' }, { valor: 'rodovia_estadual', rotulo: 'Rodovia estadual (DER)' },
  { valor: 'concessionaria', rotulo: 'Rodovia concedida' }, { valor: 'vicinal', rotulo: 'Estrada vicinal' },
  { valor: 'urbana', rotulo: 'Área urbana' }, { valor: 'particular', rotulo: 'Propriedade particular' },
];
// Trecho com licença de ocupação (faixa de domínio, prefeitura, concessionária) ou sem licenciamento.
export const LICENCIAMENTOS: Opcao[] = [
  { valor: 'licenciado', rotulo: 'Trecho licenciado' }, { valor: 'sem_licenca', rotulo: 'Sem licenciamento' },
];
export const OCORRENCIAS: Opcao[] = [
  { valor: 'cabo_exposto', rotulo: 'Cabo exposto' }, { valor: 'flecha_baixa', rotulo: 'Flecha baixa' },
  { valor: 'vegetacao', rotulo: 'Vegetação' }, { valor: 'travessia', rotulo: 'Travessia' },
  { valor: 'reserva_tecnica', rotulo: 'Reserva técnica' }, { valor: 'cabo_danificado', rotulo: 'Cabo danificado' },
  { valor: 'ferragem', rotulo: 'Ferragem / ancoragem' }, { valor: 'roedor', rotulo: 'Roedor' }, { valor: 'outro', rotulo: 'Outro' },
];
export const GRAVIDADES: Opcao[] = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'media', rotulo: 'Média' }, { valor: 'alta', rotulo: 'Alta' },
];
export const rotuloDe = (lista: Opcao[], valor: string | null | undefined) => lista.find((o) => o.valor === valor)?.rotulo ?? '';

export type PontoVistoria = {
  id: string;
  os_id: string;
  categoria: 'poste' | 'ocorrencia';
  identificacao: string | null;
  latitude: number | null;
  longitude: number | null;
  precisao_m: number | null;
  localizada_em: string | null;
  endereco: string | null;
  material: string | null;
  estado_base: string | null;
  inclinado: boolean | null;
  rachado: boolean | null;
  estai: string | null;
  precisa_troca: boolean;
  tipo_via: string | null;
  licenciamento: string | null;
  via_nome: string | null;
  ocorrencia: string | null;
  gravidade: string | null;
  observacao: string | null;
  gerar_os?: boolean | null;     // vira O.S. preventiva no backlog para correção posterior
  os_gerada_numero?: number | null;
  metragem_cabo?: number | null;  // marca de metragem impressa no cabo neste ponto (m)
  reserva_m?: number | null;      // reserva de cabo encontrada neste ponto (m)
};

const chaveOs = (osId: string) => `vistoria-pontos-${osId}`;
const CAMPOS = 'id, os_id, categoria, identificacao, latitude, longitude, precisao_m, localizada_em, endereco, material, estado_base, ' +
  'inclinado, rachado, estai, precisa_troca, tipo_via, licenciamento, via_nome, ocorrencia, gravidade, observacao, gerar_os, os_gerada_numero, metragem_cabo, reserva_m';

async function lerLocais(osId: string): Promise<PontoVistoria[]> {
  try {
    const t = await AsyncStorage.getItem(chaveOs(osId));
    return t ? JSON.parse(t) : [];
  } catch {
    return [];
  }
}

// Pontos da vistoria: na hora vem do celular; com internet atualiza do servidor (sem perder o que ainda está na fila).
export async function pontosDaOs(osId: string, aoAtualizar: (p: PontoVistoria[]) => void) {
  const locais = await lerLocais(osId);
  aoAtualizar(locais);
  const { data, error } = await supabase.from('vistoria_pontos_mapa').select(CAMPOS).eq('os_id', osId).order('localizada_em');
  if (error || !data) return;
  const doServidor = data as unknown as PontoVistoria[];
  const ids = new Set(doServidor.map((p) => p.id));
  const juntos = [...doServidor, ...locais.filter((p) => !ids.has(p.id))];
  await AsyncStorage.setItem(chaveOs(osId), JSON.stringify(juntos));
  aoAtualizar(juntos);
}

// Sugere o próximo número de poste (P-001, P-002...) a partir dos já lançados nesta vistoria.
export function proximoPoste(pontos: PontoVistoria[]) {
  const maior = pontos.reduce((m, p) => {
    const n = p.categoria === 'poste' && p.identificacao?.startsWith('P-') ? Number(p.identificacao.slice(2)) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `P-${String(maior + 1).padStart(3, '0')}`;
}

export async function salvarPonto(p: PontoVistoria, novo: boolean) {
  const lista = await lerLocais(p.os_id);
  await AsyncStorage.setItem(chaveOs(p.os_id), JSON.stringify([...lista.filter((x) => x.id !== p.id), p]));
  const poste = p.categoria === 'poste';
  const campos = {
    categoria: p.categoria,
    identificacao: p.identificacao?.trim() || null,
    posicao: p.latitude != null && p.longitude != null ? ponto(p.latitude, p.longitude) : null,
    precisao_m: p.precisao_m,
    localizada_em: p.localizada_em,
    endereco: p.endereco?.trim() || null,
    material: poste ? p.material : null,
    estado_base: poste ? p.estado_base : null,
    inclinado: poste ? p.inclinado : null,
    rachado: poste ? p.rachado : null,
    estai: poste ? p.estai : null,
    precisa_troca: poste ? p.precisa_troca : false,
    tipo_via: p.tipo_via,
    licenciamento: p.licenciamento,
    via_nome: p.via_nome?.trim() || null,
    ocorrencia: poste ? null : p.ocorrencia,
    gravidade: poste ? null : p.gravidade,
    observacao: p.observacao?.trim() || null,
    gerar_os: !!p.gerar_os,
    metragem_cabo: p.metragem_cabo ?? null,
    reserva_m: p.reserva_m ?? null,
  };
  if (novo) await enfileirar({ tipo: 'inserir', tabela: 'vistoria_pontos', linha: { id: p.id, os_id: p.os_id, ...campos } });
  else await enfileirar({ tipo: 'atualizar', tabela: 'vistoria_pontos', linhaId: p.id, campos });
}

export async function excluirPonto(p: PontoVistoria) {
  const lista = await lerLocais(p.os_id);
  await AsyncStorage.setItem(chaveOs(p.os_id), JSON.stringify(lista.filter((x) => x.id !== p.id)));
  await enfileirar({ tipo: 'excluir', tabela: 'vistoria_pontos', filtros: { id: p.id } });
}
