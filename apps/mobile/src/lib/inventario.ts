import AsyncStorage from '@react-native-async-storage/async-storage';

import { ItemFila, itensPendentes } from './fila';
import { supabase } from './supabase';

// Inventário Matinal de ferramentas e EPI (ciclo de 30 dias): cada item liberado ao técnico precisa de uma foto por ciclo.
export type ItemInventario = {
  id: string; categoria: 'ferramenta' | 'epi'; nome: string; marca_modelo: string | null; numero_serie: string | null;
  patrimonio: string | null; validade: string | null; ultima_inspecao: string | null; ultima_condicao: string | null;
  proxima_ate: string; ciclo: 'pendente' | 'vencida' | 'vence_em_breve' | 'em_dia'; enviando?: boolean;
  devolucao_solicitada_em?: string | null;
};

const CACHE = 'inventario-cache';
export const precisaFoto = (i: ItemInventario) => i.ciclo === 'pendente' || i.ciclo === 'vencida';

// Inspeções ainda na fila contam como feitas agora (o técnico não precisa repetir sem internet).
async function aplicarFila(itens: ItemInventario[]) {
  const naFila = (await itensPendentes()).filter((i): i is Extract<ItemFila, { tipo: 'inventario' }> => i.tipo === 'inventario');
  return itens.map((item) => {
    const feita = naFila.filter((f) => f.linha.ferramenta_id === item.id).pop();
    if (!feita) return item;
    const proxima = new Date(new Date(feita.linha.feita_em).getTime() + 30 * 86400000).toISOString();
    return { ...item, ultima_inspecao: feita.linha.feita_em, ultima_condicao: feita.linha.condicao, proxima_ate: proxima, ciclo: 'em_dia' as const, enviando: true };
  });
}

export async function inventarioLocal() {
  const texto = await AsyncStorage.getItem(CACHE).catch(() => null);
  return aplicarFila(texto ? JSON.parse(texto) : []);
}

export async function inventarioAtualizado() {
  const { data, error } = await supabase.from('inventario_situacao')
    .select('id, categoria, nome, marca_modelo, numero_serie, patrimonio, validade, ultima_inspecao, ultima_condicao, proxima_ate, ciclo, devolucao_solicitada_em')
    .order('categoria').order('nome');
  if (error || !data) return null;
  await AsyncStorage.setItem(CACHE, JSON.stringify(data));
  return aplicarFila(data as ItemInventario[]);
}

// Quantos itens precisam de foto agora (usa o que está no celular; atualiza do servidor quando dá).
export async function pendenciasInventario() {
  const itens = (await inventarioAtualizado()) ?? (await inventarioLocal());
  return itens.filter(precisaFoto).length;
}
