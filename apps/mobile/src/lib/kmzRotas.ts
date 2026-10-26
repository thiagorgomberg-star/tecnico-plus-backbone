import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { supabase } from './supabase';
import { comprimento, lerKmz, prepararTracado, TracadoSalvo } from './tracado';

// Rotas e os KMZ de cada uma para localizar rompimento. Tudo fica guardado no celular para usar sem sinal.
export type RotaSimples = { id: string; trecho: string; descricao: string | null };
export type KmzRota = { id: string; rota_id: string; nome_arquivo: string; extensao_m: number | null; criado_em: string; local?: boolean };

const CH_ROTAS = 'rompimento-rotas';
const chKmz = (rota: string) => `rompimento-kmz-${rota}`;
const chTracado = (id: string) => `rompimento-tracado-${id}`;

async function ler<T>(chave: string, padrao: T): Promise<T> {
  try { return JSON.parse((await AsyncStorage.getItem(chave)) ?? '') as T; } catch { return padrao; }
}

export async function rotasParaRompimento(aoAtualizar: (r: RotaSimples[]) => void) {
  aoAtualizar(await ler<RotaSimples[]>(CH_ROTAS, []));
  const { data } = await supabase.from('rotas').select('id, trecho, descricao').eq('ativo', true).order('trecho');
  if (data) { aoAtualizar(data); await AsyncStorage.setItem(CH_ROTAS, JSON.stringify(data)); }
}

// KMZ da rota: os do servidor (mais novo primeiro) e os inseridos neste celular que ainda não subiram.
export async function kmzDaRota(rotaId: string, aoAtualizar: (k: KmzRota[]) => void) {
  const guardados = await ler<KmzRota[]>(chKmz(rotaId), []);
  aoAtualizar(guardados);
  const { data } = await supabase.from('rota_kmz').select('id, rota_id, nome_arquivo, extensao_m, criado_em').eq('rota_id', rotaId).order('criado_em', { ascending: false });
  if (data) {
    const locais = guardados.filter((k) => k.local && !data.some((d) => d.id === k.id));
    const lista = [...locais, ...data];
    aoAtualizar(lista);
    await AsyncStorage.setItem(chKmz(rotaId), JSON.stringify(lista));
  }
}

export async function tracadoDoKmz(id: string): Promise<TracadoSalvo | null> {
  const guardado = await ler<TracadoSalvo | null>(chTracado(id), null);
  if (guardado) return guardado;
  const { data } = await supabase.from('rota_kmz').select('tracado').eq('id', id).single();
  if (!data) return null;
  await AsyncStorage.setItem(chTracado(id), JSON.stringify(data.tracado));
  return data.tracado as TracadoSalvo;
}

// Escolhe o KMZ/KML do celular, lê o traçado e guarda na rota (sobe junto com o arquivo quando houver sinal).
export async function inserirKmz(rotaId: string): Promise<KmzRota | null> {
  if (!requireOptionalNativeModule('ExpoDocumentPicker')) throw new Error('Para escolher arquivos do celular é preciso o APK novo.');
  const Seletor: typeof import('expo-document-picker') = require('expo-document-picker');
  const r = await Seletor.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const bytes = await new File(a.uri).bytes();
  const tracado = prepararTracado(await lerKmz(bytes));
  if (tracado.caminho.length < 2) throw new Error('Não achei a linha do cabo (LineString) neste arquivo.');
  const id = randomUUID();
  const item: KmzRota = { id, rota_id: rotaId, nome_arquivo: a.name || 'rota.kmz', extensao_m: Math.round(comprimento(tracado.caminho)), criado_em: new Date().toISOString(), local: true };
  await AsyncStorage.setItem(chTracado(id), JSON.stringify(tracado));
  await AsyncStorage.setItem(chKmz(rotaId), JSON.stringify([item, ...(await ler<KmzRota[]>(chKmz(rotaId), []))]));
  // Com sinal já guarda na rota para o painel e os outros técnicos; sem sinal fica só neste celular.
  try {
    const caminho = `${rotaId}/${id}.${/\.kml$/i.test(item.nome_arquivo) ? 'kml' : 'kmz'}`;
    const envio = await supabase.storage.from('kmz').upload(caminho, bytes, { contentType: 'application/vnd.google-earth.kmz' });
    const { error } = await supabase.from('rota_kmz').insert({
      id, rota_id: rotaId, nome_arquivo: item.nome_arquivo, caminho_arquivo: envio.error ? null : caminho, tracado, extensao_m: item.extensao_m,
    });
    if (!error) item.local = false;
  } catch { /* sem sinal */ }
  return item;
}
