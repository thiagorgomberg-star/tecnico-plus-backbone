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
