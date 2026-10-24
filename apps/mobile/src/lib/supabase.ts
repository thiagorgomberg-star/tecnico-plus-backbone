import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Endereço e chave pública do projeto (a chave publishable pode ficar no app;
// quem protege os dados são as regras do banco). Variáveis de ambiente têm prioridade.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wnuivnpywflczknxpytx.supabase.co';
const chave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_dRn1z_bQvs2zqEK_EBSCmQ_trb_hjpG';

export const supabase = createClient(url, chave, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o login só com o app em primeiro plano.
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// Formato que o PostGIS aceita para um ponto (longitude primeiro).
export function ponto(latitude: number, longitude: number) {
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}
