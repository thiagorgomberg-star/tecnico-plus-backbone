import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

export type TipoEscala = 'jornada' | 'folga_programada' | 'folga_interjornada' | 'manutencao_carro' | 'plantao' | 'sobreaviso' | 'ferias' | 'atestado' | 'outro';
export type ItemEscala = { id: string; data: string; tipo: TipoEscala; inicio: string | null; fim: string | null; observacao: string | null };

export const rotuloEscala: Record<TipoEscala, string> = {
  jornada: 'Jornada',
  folga_programada: 'Folga programada',
  folga_interjornada: 'Folga interjornada',
  manutencao_carro: 'Manutenção do carro',
  plantao: 'Plantão/sobreaviso',
  sobreaviso: 'Sobreaviso',
  ferias: 'Férias',
  atestado: 'Atestado',
  outro: 'Outro',
};

export const corEscala: Record<TipoEscala, string> = {
  jornada: '#0572CE',
  folga_programada: '#508223',
  folga_interjornada: '#6B8E23',
  manutencao_carro: '#C2410C',
  plantao: '#C74634',
  sobreaviso: '#E08A1E',
  ferias: '#227E9E',
  atestado: '#7B5EA7',
  outro: '#6F6964',
};

const BLOQUEIAM: TipoEscala[] = ['folga_programada', 'folga_interjornada', 'ferias', 'atestado'];
const CACHE = 'escala-cache';

// Data local no formato do banco (AAAA-MM-DD).
export const hojeLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Escala dos próximos 60 dias, guardada no celular para valer também offline.
export async function carregarEscala(): Promise<ItemEscala[]> {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 7);
  const fim = new Date();
  fim.setDate(fim.getDate() + 60);
  const { data } = await supabase
    .from('escala')
    .select('id, data, tipo, inicio, fim, observacao')
    .gte('data', hojeLocal(inicio))
    .lte('data', hojeLocal(fim))
    .order('data');
  if (data) {
    await AsyncStorage.setItem(CACHE, JSON.stringify(data));
    return data;
  }
  const cache = await AsyncStorage.getItem(CACHE);
  return cache ? JSON.parse(cache) : [];
}

// Folga programada, férias ou atestado hoje impedem iniciar o expediente.
// Usa o que está no celular se o servidor não responder em 2,5 s (sinal fraco não trava o início).
export async function bloqueioDeHoje(): Promise<ItemEscala | null> {
  const cache = AsyncStorage.getItem(CACHE).then((c): ItemEscala[] => (c ? JSON.parse(c) : []));
  const escala = await Promise.race([carregarEscala(), new Promise<ItemEscala[]>((ok) => setTimeout(() => cache.then(ok), 2500))]);
  const hoje = hojeLocal();
  return escala.find((e) => e.data === hoje && BLOQUEIAM.includes(e.tipo)) ?? null;
}
