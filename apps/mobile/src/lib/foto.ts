import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

// Foto de perfil do crachá. Fica no bucket privado documentos-tecnico (<usuario>/foto.jpg) e uma cópia no celular,
// para aparecer mesmo sem internet. foto_em (servidor) diz quando a cópia local ficou velha.
const CHAVE = 'foto-perfil-em';
const pasta = () => new Directory(Paths.document, 'perfil');
const local = () => new File(pasta(), 'foto.jpg');
const comVersao = (em: string) => `${local().uri}?v=${encodeURIComponent(em)}`;

// Devolve o endereço da foto guardada (na hora) e, se o servidor tiver uma mais nova, baixa e avisa de novo.
export async function minhaFoto(aoAtualizar: (uri: string | null) => void) {
  const guardada = await AsyncStorage.getItem(CHAVE).catch(() => null);
  if (guardada && local().exists) aoAtualizar(comVersao(guardada));
  const { data: sessao } = await supabase.auth.getSession();
  const id = sessao.session?.user.id;
  if (!id) return;
  const { data } = await supabase.from('usuarios').select('foto, foto_em').eq('id', id).maybeSingle();
  if (!data?.foto || !data.foto_em) return;
  if (data.foto_em === guardada && local().exists) return;
  const { data: link } = await supabase.storage.from('documentos-tecnico').createSignedUrl(data.foto, 300);
  if (!link) return;
  if (!pasta().exists) pasta().create({ intermediates: true });
  if (local().exists) local().delete();
  await File.downloadFileAsync(link.signedUrl, local());
  await AsyncStorage.setItem(CHAVE, data.foto_em);
  aoAtualizar(comVersao(data.foto_em));
}

// Tira ou escolhe a foto (recorte quadrado), envia e guarda a cópia local. Devolve o novo endereço, ou null se cancelou.
export async function trocarFoto(origem: 'camera' | 'galeria'): Promise<string | null> {
  const permissao = origem === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) throw new Error('Permita o acesso à câmera/galeria para trocar a foto.');
  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 0.5, exif: false, allowsEditing: true, aspect: [1, 1],
    cameraType: ImagePicker.CameraType.front,
  };
  const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
  if (r.canceled || !r.assets[0]) return null;

  const { data: sessao } = await supabase.auth.getSession();
  const id = sessao.session?.user.id;
  if (!id) throw new Error('Sessão expirada. Entre de novo.');
  const conteudo = await new File(r.assets[0].uri).arrayBuffer();
  const envio = await supabase.storage.from('documentos-tecnico')
    .upload(`${id}/foto.jpg`, conteudo, { contentType: 'image/jpeg', upsert: true });
  if (envio.error) throw new Error('Não foi possível enviar a foto. Verifique a internet.');
  const { data: em, error } = await supabase.rpc('definir_minha_foto');
  if (error || !em) throw new Error('A foto subiu, mas não foi registrada. Tente de novo.');

  if (!pasta().exists) pasta().create({ intermediates: true });
  if (local().exists) local().delete();
  new File(r.assets[0].uri).copy(local());
  await AsyncStorage.setItem(CHAVE, em as string);
  return comVersao(em as string);
}
