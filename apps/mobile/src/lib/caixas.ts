import AsyncStorage from '@react-native-async-storage/async-storage';

import { enfileirar } from './fila';
import { CaixaRede, instalacoesDoTipo, Manobra, SituacaoFibra } from './fusao';
import { ponto, supabase } from './supabase';

// Caixa de emenda / entroncamento / DGO como o app guarda (funciona offline; a fila envia depois).
export type Caixa = CaixaRede & {
  os_id: string;
  tipo: string;
  grupos_fusionados: number;
  grupos_vagos: number;
  observacao: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  precisao_m: number | null;
  localizada_em: string | null;
  manobras: Manobra[];
  fibras: SituacaoFibra[];
  parceiro?: string | null;
  instalacao?: string | null;
  bastidor?: string | null;
  fila?: string | null;
  rack?: string | null;
  padrao_cores_entrada?: string | null;
  padrao_cores_saidas?: (string | null)[] | null;
};

const chaveOs = (osId: string) => `caixas-os-${osId}`;
const CHAVE_REDE = 'caixas-rede';

async function ler<T>(chave: string, padrao: T): Promise<T> {
  try {
    const t = await AsyncStorage.getItem(chave);
    return t ? JSON.parse(t) : padrao;
  } catch {
    return padrao;
  }
}

const CAMPOS = 'id, os_id, tipo, identificacao, capacidade_fibras, saidas, grupos_fusionados, grupos_vagos, observacao, endereco, ' +
  'latitude, longitude, precisao_m, localizada_em, origem_caixa_id, origem_saida, origem_dgo, origem_identificacao, manobras, fibras, fusoes_por_bandeja, parceiro, instalacao, bastidor, padrao_cores_entrada, padrao_cores_saidas, fila, rack';

// Caixas da O.S.: na hora vem do celular; com internet atualiza do servidor (sem perder o que ainda está na fila).
export async function caixasDaOs(osId: string, aoAtualizar: (c: Caixa[]) => void) {
  const locais = await ler<Caixa[]>(chaveOs(osId), []);
  aoAtualizar(locais);
  const { data, error } = await supabase.from('caixas_mapa').select(CAMPOS).eq('os_id', osId).order('localizada_em');
  if (error || !data) return;
  const doServidor = (data as unknown as (Caixa & { origem_identificacao: string | null })[])
    .map((c) => ({ ...c, origem: c.origem_identificacao ?? (c.origem_dgo ? `DGO ${c.origem_dgo}` : null) }));
  const ids = new Set(doServidor.map((c) => c.id));
  const juntas = [...doServidor, ...locais.filter((c) => !ids.has(c.id))];
  await AsyncStorage.setItem(chaveOs(osId), JSON.stringify(juntas));
  aoAtualizar(juntas);
}

// Lista final das caixas da O.S. (servidor quando há internet, senão o que está no celular).
export async function caixasAtuais(osId: string) {
  let ultimas: Caixa[] = [];
  await caixasDaOs(osId, (c) => { ultimas = c; });
  return ultimas;
}

// Próxima TAG automática (CE-BKB-0001...) olhando as caixas conhecidas no celular; o servidor confirma ao sincronizar.
export const PREFIXO_TAG: Record<string, string> = { emenda: 'CE-BKB-', entroncamento: 'ENT-BKB-', dgo: 'DGO-BKB-', site: 'SITE-BKB-' };
export function proximaTag(tipo: string, conhecidas: { identificacao: string }[]) {
  const prefixo = PREFIXO_TAG[tipo] ?? PREFIXO_TAG.emenda;
  const maior = conhecidas.reduce((m, c) => {
    const n = c.identificacao.startsWith(prefixo) ? Number(c.identificacao.slice(prefixo.length)) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefixo}${String(maior + 1).padStart(4, '0')}`;
}

// Caixas já cadastradas na rede (para escolher a caixa anterior). Guarda no celular para usar offline.
// Caixas da rede: entrega na hora as guardadas no celular (sem sinal é o que vale) e, se o servidor responder, atualiza.
export async function caixasDaRede(aoAtualizar?: (c: CaixaRede[]) => void): Promise<CaixaRede[]> {
  const guardadas = await ler<CaixaRede[]>(CHAVE_REDE, []);
  aoAtualizar?.(guardadas);
  try {
    const { data } = await supabase.from('caixas_mapa').select(CAMPOS).order('atualizado_em', { ascending: false }).limit(1000);
    if (data) {
      await AsyncStorage.setItem(CHAVE_REDE, JSON.stringify(data));
      aoAtualizar?.(data as unknown as CaixaRede[]);
      return data as unknown as CaixaRede[];
    }
  } catch { /* sem sinal */ }
  return guardadas;
}

export async function salvarCaixa(caixa: Caixa, nova: boolean) {
  const lista = await ler<Caixa[]>(chaveOs(caixa.os_id), []);
  const outras = lista.filter((c) => c.id !== caixa.id);
  await AsyncStorage.setItem(chaveOs(caixa.os_id), JSON.stringify([...outras, caixa]));

  const campos = {
    tipo: caixa.tipo,
    identificacao: caixa.identificacao,
    capacidade_fibras: caixa.capacidade_fibras,
    saidas: caixa.saidas,
    grupos_fusionados: caixa.grupos_fusionados,
    grupos_vagos: caixa.grupos_vagos,
    fusoes_por_bandeja: caixa.fusoes_por_bandeja || null,
    parceiro: caixa.tipo === 'site' || (caixa.tipo === 'dgo' && caixa.instalacao === 'site_parceiro') ? caixa.parceiro?.trim() || null : null,
    padrao_cores_entrada: caixa.padrao_cores_entrada || null,
    padrao_cores_saidas: caixa.saidas.some((_, i) => caixa.padrao_cores_saidas?.[i])
      ? caixa.saidas.map((_, i) => caixa.padrao_cores_saidas?.[i] || null) : null,
    bastidor: caixa.tipo === 'dgo' ? caixa.bastidor?.trim() || null : null,
    fila: caixa.tipo === 'dgo' ? caixa.fila?.trim() || null : null,
    rack: caixa.tipo === 'dgo' ? caixa.rack?.trim() || null : null,
    instalacao: instalacoesDoTipo(caixa.tipo).some((x) => x.valor === caixa.instalacao) ? caixa.instalacao ?? null : null,
    observacao: caixa.observacao,
    endereco: caixa.endereco,
    posicao: caixa.latitude != null && caixa.longitude != null ? ponto(caixa.latitude, caixa.longitude) : null,
    precisao_m: caixa.precisao_m,
    localizada_em: caixa.localizada_em,
    origem_caixa_id: caixa.origem_caixa_id,
    origem_saida: caixa.origem_saida,
    origem_dgo: caixa.origem_dgo,
  };
  if (nova) {
    await enfileirar({ tipo: 'inserir', tabela: 'caixas_emenda', linha: { id: caixa.id, os_id: caixa.os_id, ...campos } });
  } else {
    await enfileirar({ tipo: 'atualizar', tabela: 'caixas_emenda', linhaId: caixa.id, campos });
    await enfileirar({ tipo: 'excluir', tabela: 'caixa_manobras', filtros: { caixa_id: caixa.id } });
    await enfileirar({ tipo: 'excluir', tabela: 'caixa_fibras', filtros: { caixa_id: caixa.id } });
  }
  if (caixa.manobras.length) {
    await enfileirar({
      tipo: 'inserirVarios', tabela: 'caixa_manobras',
      linhas: caixa.manobras.map((m) => ({ caixa_id: caixa.id, fibra_entrada: m.fibra_entrada, saida: m.saida, fibra_saida: m.fibra_saida, motivo: m.motivo || null })),
    });
  }
  const fibras = caixa.fibras.filter((f) => f.cliente || f.sem_potencia || f.potencia_dbm != null || f.reflexao_db != null || f.perda_db_km != null
    || f.posicao_dgo || f.potencia_tx_dbm != null || f.potencia_rx_dbm != null || f.cordao_olt);
  if (fibras.length) {
    await enfileirar({
      tipo: 'inserirVarios', tabela: 'caixa_fibras',
      linhas: fibras.map((f) => ({ caixa_id: caixa.id, fibra: f.fibra, cliente: f.cliente || null, sem_potencia: f.sem_potencia,
        potencia_dbm: f.potencia_dbm ?? null, reflexao_db: f.reflexao_db ?? null, perda_db_km: f.perda_db_km ?? null,
        posicao_dgo: f.posicao_dgo || null, potencia_tx_dbm: f.potencia_tx_dbm ?? null, potencia_rx_dbm: f.potencia_rx_dbm ?? null,
        cordao_olt: !!f.cordao_olt, olt_posicao: f.cordao_olt ? f.olt_posicao || null : null, sfp_tipo: f.cordao_olt ? f.sfp_tipo || null : null,
        cordao_tipo: f.cordao_olt ? f.cordao_tipo || null : null, olt_modelo: f.cordao_olt ? f.olt_modelo || null : null,
        sfp_modelo: f.cordao_olt ? f.sfp_modelo || null : null })),
    });
  }
}
