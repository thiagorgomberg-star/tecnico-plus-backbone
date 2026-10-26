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

  const novas = await baixarFotos(caixaId);
  if (novas) aoAtualizar([...novas, ...(await daFila())]);
}

// Baixa (o que faltar) e guarda no celular as fotos de uma caixa; null quando não há sinal.
async function baixarFotos(caixaId: string): Promise<FotoCaixa[] | null> {
  try {
    const { data, error } = await supabase.rpc('fotos_da_caixa', { p_caixa: caixaId });
    if (error || !data) return null;
    const lista = data as { caminho: string; tipo: string; bandeja: number | null; fibra: number | null; tirada_em: string | null }[];
    if (!lista.length) { await AsyncStorage.setItem(chave(caixaId), '[]'); return []; }
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
    return novas;
  } catch {
    return null;
  }
}

// Antes de entrar na área sem sinal: baixa as fotos das caixas dos trechos das O.S. abertas do técnico
// (e das caixas dessas O.S.). Roda uma vez por abertura do app, só o que ainda não está no celular.
let baixando = false;
export async function baixarFotosDaRota() {
  if (baixando) return;
  baixando = true;
  try {
    const { data: sessao } = await supabase.auth.getSession();
    const eu = sessao.session?.user.id;
    if (!eu) return;
    const { data: ordens } = await supabase.from('ordens_servico').select('id, rota:rotas(trecho)')
      .eq('tecnico_id', eu).in('status', ['enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida']);
    if (!ordens?.length) return;
    const trechos = ordens.map((o) => (o.rota as unknown as { trecho: string } | null)?.trecho).filter(Boolean) as string[];
    const ids = ordens.map((o) => o.id);
    const filtro = [`os_id.in.(${ids.join(',')})`, ...(trechos.length ? [`trecho.in.(${trechos.map((t) => `"${t.replace(/"/g, '')}"`).join(',')})`] : [])].join(',');
    const { data: caixas } = await supabase.from('caixas_mapa').select('id').or(filtro).limit(500);
    for (const c of caixas ?? []) {
      if ((await baixarFotos(c.id)) === null) break; // perdeu o sinal: tenta de novo na próxima abertura
    }
  } catch { /* sem sinal */ } finally {
    baixando = false;
  }
}
