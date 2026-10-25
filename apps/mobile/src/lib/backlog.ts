import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

// O.S. do backlog (ainda não despachadas) que o técnico pode assumir e ir atender.
export type ItemBacklog = {
  id: string; numero: number; tipo: string; prioridade: 'emergencia' | 'alta' | 'media' | 'baixa'; titulo: string; descricao: string | null;
  endereco: string | null; lat: number | null; lng: number | null; ticket_acionamento: string | null; sla_limite: string | null;
  criado_em: string; reservada: boolean;
};
const CACHE = 'backlog-cache';

export async function backlogGuardado(): Promise<ItemBacklog[]> {
  const c = await AsyncStorage.getItem(CACHE).catch(() => null);
  return c ? JSON.parse(c) : [];
}

// null = sem internet (fica o que está guardado).
export async function buscarBacklog(): Promise<ItemBacklog[] | null> {
  const { data, error } = await supabase.rpc('backlog_disponivel');
  if (error || !data) return null;
  await AsyncStorage.setItem(CACHE, JSON.stringify(data));
  return data as ItemBacklog[];
}

export async function assumirBacklog(id: string) {
  const { error } = await supabase.rpc('assumir_backlog', { p_os: id });
  if (error) throw new Error(/assumida|despachada/.test(error.message) ? error.message : 'Não foi possível assumir. Verifique a internet.');
}

// Dados extras para a tela de detalhe (quem abriu/informou, trecho, origem). Fica guardado para abrir sem internet.
export type DetalheBacklog = {
  criada_por: string | null; informado_por: string | null; trecho: string | null; regiao: string | null;
  observacao_supervisor: string | null; prazo: string | null; evento_localizado_em: string | null; evento_precisao_m: number | null;
  ponto: { categoria: string; identificacao: string | null; ocorrencia: string | null; observacao: string | null; via: string | null } | null;
  fotos: number;
};

export async function detalheBacklog(id: string, aoAtualizar: (d: DetalheBacklog) => void) {
  const chave = `backlog-detalhe-${id}`;
  const guardado = await AsyncStorage.getItem(chave).catch(() => null);
  if (guardado) aoAtualizar(JSON.parse(guardado));
  const { data, error } = await supabase.rpc('detalhe_backlog', { p_os: id });
  if (error || !data) return;
  await AsyncStorage.setItem(chave, JSON.stringify(data));
  aoAtualizar(data as DetalheBacklog);
}
