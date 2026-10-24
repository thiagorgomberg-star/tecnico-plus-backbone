import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

export type MeuVeiculo = {
  id: string; placa: string; marca: string | null; modelo: string | null; cor: string | null; km_atual: number | null;
  situacao_oleo: string; proxima_troca_km: number | null; proxima_troca_data: string | null;
};
const CHAVE_VEICULO = 'meu-veiculo';
// Veículo vinculado ao técnico (guardado no celular para funcionar sem internet).
export async function meuVeiculo(atualizar = true): Promise<MeuVeiculo | null> {
  if (atualizar) {
    const { data: sessao } = await supabase.auth.getSession();
    const id = sessao.session?.user.id;
    if (id) {
      const { data, error } = await supabase.from('veiculos_situacao')
        .select('id, placa, marca, modelo, cor, km_atual, situacao_oleo, proxima_troca_km, proxima_troca_data')
        .eq('tecnico_id', id).eq('ativo', true).maybeSingle();
      if (!error) {
        await AsyncStorage.setItem(CHAVE_VEICULO, JSON.stringify(data));
        return data;
      }
    }
  }
  const c = await AsyncStorage.getItem(CHAVE_VEICULO);
  return c ? JSON.parse(c) : null;
}
export const descreverVeiculo = (v: Pick<MeuVeiculo, 'placa' | 'marca' | 'modelo' | 'cor'>) =>
  [[v.marca, v.modelo].filter(Boolean).join(' '), v.placa, v.cor].filter(Boolean).join(' · ');
