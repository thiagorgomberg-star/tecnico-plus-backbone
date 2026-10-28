import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

export type MinhaEquipe = {
  classe: 'L' | 'F' | null;
  tecnico: { nome: string; cargo: string | null };
  auxiliares: { nome: string; cargo: string | null }[];
};

// Equipe de quem está logado (técnico ou auxiliar), para a máscara da foto.
// Guarda a última resposta: sem sinal, a câmera usa a guardada.
export async function minhaEquipe(): Promise<MinhaEquipe | null> {
  try {
    const { data, error } = await supabase.rpc('minha_equipe');
    if (!error && data) {
      await AsyncStorage.setItem('minha-equipe', JSON.stringify(data));
      return data as MinhaEquipe;
    }
  } catch {
    // sem internet
  }
  const c = await AsyncStorage.getItem('minha-equipe').catch(() => null);
  return c ? JSON.parse(c) : null;
}
