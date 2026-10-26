import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { itensPendentes } from './fila';
import { supabase } from './supabase';

// Fotos de uma caixa da rede (acomodação, bandejas, OLT, OTDR) para conferir em campo.
// Com sinal baixa e guarda no celular; sem sinal mostra o que já foi guardado e as fotos ainda na fila deste celular.
export type FotoCaixa = { uri: string; tipo: string; bandeja: number | null; fibra: number | null; tiradaEm: string | null; pendente?: boolean };
const chave = (id: string) => `fotos-caixa-${id}`;
const pasta = (id: string) => new Directory(Paths.document, 'fotos-caixas', id);

export const rotuloFotoCaixa = (f: FotoCaixa) =>
  f.tipo === 'foto_bandeja' ? `Bandeja ${f.bandeja ?? ''}` : f.tipo === 'foto_olt' ? 'OLT' : f.tipo === 'foto_otdr' ? `OTDR · FO ${f.fibra ?? ''}` : 'Acomodação';

export async function fotosDaCaixa(caixaId: string, aoAtualizar: (f: FotoCaixa[]) => void) {
  const daFila = async () => (await itensPendentes()).flatMap((i) => (i.tipo === 'foto' && i.caixaId === caixaId
    ? [{ uri: i.arquivo, tipo: i.tipoAnexo, bandeja: i.bandeja ?? null, fibra: i.fibra ?? null, tiradaEm: i.tiradaEm, pendente: true }] : []));
  let guardadas: FotoCaixa[] = [];
  try { guardadas = JSON.parse((await AsyncStorage.getItem(chave(caixaId))) ?? '[]'); } catch { /* sem cache */ }
  guardadas = guardadas.filter((f) => new File(f.uri).exists);
  const fila = await daFila();
  aoAtualizar([...guardadas, ...fila]);

  try {
    const { data, error } = await supabase.rpc('fotos_da_caixa', { p_caixa: caixaId });
    if (error || !data) return;
    const lista = data as { caminho: string; tipo: string; bandeja: number | null; fibra: number | null; tirada_em: string | null }[];
    if (!pasta(caixaId).exists) pasta(caixaId).create({ intermediates: true });
    const novas: FotoCaixa[] = [];
    for (const a of lista) {
      const local = new File(pasta(caixaId), a.caminho.replace(/[^\w.-]+/g, '_'));
      if (!local.exists) {
        const { data: url } = await supabase.storage.from('os-anexos').createSignedUrl(a.caminho, 600);
        if (!url) continue;
        await File.downloadFileAsync(url.signedUrl, local).catch(() => null);
        if (!local.exists) continue;
      }
      novas.push({ uri: local.uri, tipo: a.tipo, bandeja: a.bandeja, fibra: a.fibra, tiradaEm: a.tirada_em });
    }
    await AsyncStorage.setItem(chave(caixaId), JSON.stringify(novas));
    aoAtualizar([...novas, ...(await daFila())]);
  } catch { /* sem sinal: fica o que já estava guardado */ }
}
