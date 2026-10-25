import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from './supabase';

// Fotos de referência de uma O.S. gerada na vistoria (fotos do ponto). Ficam guardadas no celular para servirem
// de guia offline: o técnico fotografa a correção no mesmo ângulo.
const chave = (osId: string) => `referencias-${osId}`;
const pasta = (osId: string) => new Directory(Paths.document, 'referencias', osId);

export async function referenciasLocais(osId: string): Promise<string[]> {
  try {
    const lista: string[] = JSON.parse((await AsyncStorage.getItem(chave(osId))) ?? '[]');
    return lista.filter((uri) => new File(uri).exists);
  } catch {
    return [];
  }
}

export async function fotosReferencia(osId: string, aoAtualizar: (uris: string[]) => void) {
  const locais = await referenciasLocais(osId);
  if (locais.length) aoAtualizar(locais);
  const { data, error } = await supabase.rpc('fotos_referencia', { p_os: osId });
  if (error || !data?.length) return;
  if (!pasta(osId).exists) pasta(osId).create({ intermediates: true });
  const uris: string[] = [];
  for (const a of data as { id: string; caminho_arquivo: string }[]) {
    const destino = new File(pasta(osId), `${a.id}.jpg`);
    if (!destino.exists) {
      const { data: link } = await supabase.storage.from('os-anexos').createSignedUrl(a.caminho_arquivo, 600);
      if (!link) continue;
      await File.downloadFileAsync(link.signedUrl, destino).catch(() => null);
    }
    if (destino.exists) uris.push(destino.uri);
  }
  await AsyncStorage.setItem(chave(osId), JSON.stringify(uris));
  aoAtualizar(uris);
}
