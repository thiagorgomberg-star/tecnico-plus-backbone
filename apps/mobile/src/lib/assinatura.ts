import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { enfileirar } from './fila';
import { supabase } from './supabase';

// Assinatura do técnico: desenhada uma vez, guardada no celular (funciona offline) e com cópia no servidor
// (documentos-tecnico/<usuario>/assinatura.jpg) para voltar se trocar de celular. Cada O.S. recebe uma cópia dela.
const PENDENTE = 'assinatura-envio-pendente';
const pasta = () => new Directory(Paths.document, 'perfil');
const local = () => new File(pasta(), 'assinatura.jpg');

async function meuId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function enviar() {
  const id = await meuId();
  if (!id || !local().exists) return;
  const { error } = await supabase.storage.from('documentos-tecnico')
    .upload(`${id}/assinatura.jpg`, await local().arrayBuffer(), { contentType: 'image/jpeg', upsert: true });
  if (error) await AsyncStorage.setItem(PENDENTE, 'sim');
  else await AsyncStorage.removeItem(PENDENTE);
}

// Endereço da assinatura guardada; se não tiver no celular, tenta baixar a do servidor.
export async function minhaAssinatura(): Promise<string | null> {
  if (local().exists) {
    if (await AsyncStorage.getItem(PENDENTE)) enviar().catch(() => {});
    return `${local().uri}?v=${local().modificationTime ?? 0}`;
  }
  const id = await meuId();
  if (!id) return null;
  const { data } = await supabase.storage.from('documentos-tecnico').createSignedUrl(`${id}/assinatura.jpg`, 300);
  if (!data) return null;
  if (!pasta().exists) pasta().create({ intermediates: true });
  await File.downloadFileAsync(data.signedUrl, local()).catch(() => null);
  return local().exists ? local().uri : null;
}

// Guarda a assinatura recém-desenhada (arquivo temporário da captura do quadro).
export async function salvarMinhaAssinatura(temporario: string) {
  if (!pasta().exists) pasta().create({ intermediates: true });
  if (local().exists) local().delete();
  new File(temporario).move(local());
  await enviar().catch(() => AsyncStorage.setItem(PENDENTE, 'sim'));
}

// Assina a O.S.: uma cópia da assinatura cadastrada entra na fila como anexo (sobe quando houver sinal).
export async function assinarOS(osId: string, nome: string) {
  if (!local().exists) throw new Error('Cadastre sua assinatura primeiro.');
  const fotos = new Directory(Paths.document, 'fotos');
  if (!fotos.exists) fotos.create();
  const copia = new File(fotos, `${randomUUID()}.jpg`);
  local().copy(copia);
  await enfileirar({
    tipo: 'foto', osId, tipoAnexo: 'assinatura', arquivo: copia.uri, largura: 0, altura: 0,
    tiradaEm: new Date().toISOString(), latitude: null, longitude: null, descricao: nome,
  });
}
