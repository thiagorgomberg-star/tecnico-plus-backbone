import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from './supabase';

// Cursos (NR e profissionalizantes) e licenças do técnico, cadastrados pelo supervisor no painel.
// Os PDFs ficam guardados no celular para abrir e mostrar na fiscalização mesmo sem internet.
export type Curso = {
  id: string; tipo: 'nr' | 'profissionalizante' | 'licenca'; curso: string; instituicao: string | null; carga_horaria: number | null;
  data_conclusao: string | null; validade: string | null; arquivo: string | null;
};
const CACHE = 'meus-cursos';
const pasta = () => new Directory(Paths.document, 'documentos');
const arquivoLocal = (c: Curso) => new File(pasta(), `${c.id}.pdf`);

export async function meusCursos(aoAtualizar: (c: Curso[]) => void) {
  const cache = await AsyncStorage.getItem(CACHE).catch(() => null);
  if (cache) aoAtualizar(JSON.parse(cache));
  const { data: sessao } = await supabase.auth.getSession();
  const id = sessao.session?.user.id;
  if (!id) return;
  const { data, error } = await supabase.from('tecnico_cursos')
    .select('id, tipo, curso, instituicao, carga_horaria, data_conclusao, validade, arquivo')
    .eq('usuario_id', id).order('validade', { nullsFirst: false });
  if (error || !data) return;
  aoAtualizar(data as Curso[]);
  await AsyncStorage.setItem(CACHE, JSON.stringify(data));
  // Baixa em segundo plano os PDFs que ainda não estão no celular.
  for (const c of data as Curso[]) if (c.arquivo && !temPdfLocal(c)) baixar(c).catch(() => {});
}

export const temPdfLocal = (c: Curso) => {
  try {
    return arquivoLocal(c).exists;
  } catch {
    return false;
  }
};

async function baixar(c: Curso) {
  const { data, error } = await supabase.storage.from('documentos-tecnico').createSignedUrl(c.arquivo!, 300);
  if (error || !data) throw error ?? new Error('sem link');
  if (!pasta().exists) pasta().create({ intermediates: true });
  const destino = arquivoLocal(c);
  if (destino.exists) destino.delete();
  return File.downloadFileAsync(data.signedUrl, destino);
}

export async function abrirPdf(c: Curso) {
  const local = temPdfLocal(c) ? arquivoLocal(c) : await baixar(c);
  await Sharing.shareAsync(local.uri, { mimeType: 'application/pdf', dialogTitle: c.curso, UTI: 'com.adobe.pdf' });
}

export const situacaoCurso = (c: Curso): 'vencido' | 'vence' | 'ok' | 'sem' => {
  if (!c.validade) return 'sem';
  const hoje = new Date().toISOString().slice(0, 10);
  if (c.validade < hoje) return 'vencido';
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 2);
  return c.validade <= limite.toISOString().slice(0, 10) ? 'vence' : 'ok';
};
