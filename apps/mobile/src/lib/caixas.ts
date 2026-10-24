import AsyncStorage from '@react-native-async-storage/async-storage';

import { enfileirar } from './fila';
import { CaixaRede, Manobra, SituacaoFibra } from './fusao';
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
  'latitude, longitude, precisao_m, localizada_em, origem_caixa_id, origem_saida, origem_dgo, origem_identificacao, manobras, fibras';

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

// Caixas já cadastradas na rede (para escolher a caixa anterior). Guarda no celular para usar offline.
export async function caixasDaRede(): Promise<CaixaRede[]> {
  const { data } = await supabase.from('caixas_mapa').select(CAMPOS).order('atualizado_em', { ascending: false }).limit(300);
  if (data) {
    await AsyncStorage.setItem(CHAVE_REDE, JSON.stringify(data));
    return data as unknown as CaixaRede[];
  }
  return ler<CaixaRede[]>(CHAVE_REDE, []);
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
  const fibras = caixa.fibras.filter((f) => f.cliente || f.sem_potencia || f.potencia_dbm != null || f.reflexao_db != null || f.perda_db_km != null);
  if (fibras.length) {
    await enfileirar({
      tipo: 'inserirVarios', tabela: 'caixa_fibras',
      linhas: fibras.map((f) => ({ caixa_id: caixa.id, fibra: f.fibra, cliente: f.cliente || null, sem_potencia: f.sem_potencia,
        potencia_dbm: f.potencia_dbm ?? null, reflexao_db: f.reflexao_db ?? null, perda_db_km: f.perda_db_km ?? null })),
    });
  }
}
