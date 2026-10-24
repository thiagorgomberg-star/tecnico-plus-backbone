import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { AppState } from 'react-native';

import { supabase } from './supabase';

// Tudo que o técnico faz em campo entra nesta fila e é enviado quando houver internet.
// A ordem é mantida: uma O.S. só é concluída depois que as fotos dela subiram.

export type ItemFila =
  | {
      tipo: 'foto';
      id: string;
      osId: string;
      tipoAnexo: 'foto_antes' | 'foto_depois';
      arquivo: string;
      largura: number;
      altura: number;
      tiradaEm: string;
      latitude: number | null;
      longitude: number | null;
    }
  | { tipo: 'os'; id: string; osId: string; campos: Record<string, unknown> }
  | { tipo: 'rpc'; id: string; nome: string; args: Record<string, unknown> };

type NovoItem = ItemFila extends infer T ? (T extends ItemFila ? Omit<T, 'id'> : never) : never;

const CHAVE = 'fila-offline';
const CHAVE_RECUSADOS = 'fila-recusados';
const ouvintes = new Set<() => void>();
let enviando = false;
let ultimoErro: string | null = null;

async function ler(): Promise<ItemFila[]> {
  const texto = await AsyncStorage.getItem(CHAVE);
  return texto ? JSON.parse(texto) : [];
}

async function gravar(itens: ItemFila[]) {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(itens));
  ouvintes.forEach((f) => f());
}

export async function enfileirar(item: NovoItem) {
  const itens = await ler();
  itens.push({ ...item, id: randomUUID() } as ItemFila);
  await gravar(itens);
  sincronizar();
}

export const itensPendentes = ler;
export const erroSincronizacao = () => ultimoErro;

export function aoMudarFila(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

async function enviar(item: ItemFila) {
  if (item.tipo === 'foto') {
    const caminho = `${item.osId}/${item.id}.jpg`;
    const conteudo = await new File(item.arquivo).arrayBuffer();
    const envio = await supabase.storage
      .from('os-anexos')
      .upload(caminho, conteudo, { contentType: 'image/jpeg', upsert: true });
    if (envio.error) throw envio.error;
    const { error } = await supabase.from('os_anexos').upsert(
      {
        id: item.id,
        os_id: item.osId,
        tipo: item.tipoAnexo,
        caminho_arquivo: caminho,
        largura_px: item.largura,
        altura_px: item.altura,
        tirada_em: item.tiradaEm,
        posicao:
          item.latitude != null && item.longitude != null
            ? `SRID=4326;POINT(${item.longitude} ${item.latitude})`
            : null,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
    new File(item.arquivo).delete();
  } else if (item.tipo === 'os') {
    const { error } = await supabase.from('ordens_servico').update(item.campos).eq('id', item.osId);
    if (error) throw error;
  } else {
    const { error } = await supabase.rpc(item.nome, item.args);
    if (error) throw error;
  }
}

// Erro com código SQLSTATE (5 caracteres) veio do banco; sem código é falta de rede.
function recusadoPeloBanco(e: unknown) {
  const codigo = (e as { code?: unknown })?.code;
  return typeof codigo === 'string' && codigo.length === 5;
}

export async function sincronizar() {
  if (enviando) return;
  enviando = true;
  try {
    let itens = await ler();
    while (itens.length > 0) {
      try {
        await enviar(itens[0]);
        ultimoErro = null;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e);
        if (!recusadoPeloBanco(e)) {
          ouvintes.forEach((f) => f());
          return; // sem internet: tenta de novo no próximo ciclo
        }
        // Regra do banco recusou (ex.: O.S. sem 10 fotos): guarda para revisão e segue a fila.
        const recusados = JSON.parse((await AsyncStorage.getItem(CHAVE_RECUSADOS)) ?? '[]');
        recusados.push({ item: itens[0], erro: ultimoErro, em: new Date().toISOString() });
        await AsyncStorage.setItem(CHAVE_RECUSADOS, JSON.stringify(recusados));
      }
      itens = (await ler()).slice(1);
      await gravar(itens);
    }
  } finally {
    enviando = false;
  }
}

setInterval(sincronizar, 30_000);
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') sincronizar();
});
