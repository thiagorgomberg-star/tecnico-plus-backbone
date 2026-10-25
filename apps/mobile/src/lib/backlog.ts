import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import { idadeOs } from './formato';
import { distanciaKm } from './navegacao';
import { supabase } from './supabase';

// O.S. do backlog (ainda não despachadas) que o técnico pode assumir e ir atender.
export type ItemBacklog = {
  id: string; numero: number; tipo: string; prioridade: 'emergencia' | 'alta' | 'media' | 'baixa'; titulo: string; descricao: string | null;
  endereco: string | null; lat: number | null; lng: number | null; ticket_acionamento: string | null; sla_limite: string | null;
  criado_em: string; reservada: boolean;
};
const CACHE = 'backlog-cache';

export async function backlogGuardado(): Promise<ItemBacklog[]> {
  const c = await AsyncStorage.getItem(CACHE).catch(() => null);
  return c ? JSON.parse(c) : [];
}

// null = sem internet (fica o que está guardado).
export async function buscarBacklog(): Promise<ItemBacklog[] | null> {
  const { data, error } = await supabase.rpc('backlog_disponivel');
  if (error || !data) return null;
  await AsyncStorage.setItem(CACHE, JSON.stringify(data));
  return data as ItemBacklog[];
}

export async function assumirBacklog(id: string) {
  const { error } = await supabase.rpc('assumir_backlog', { p_os: id });
  if (error) throw new Error(/assumida|despachada/.test(error.message) ? error.message : 'Não foi possível assumir. Verifique a internet.');
}

// Dados extras para a tela de detalhe (quem abriu/informou, trecho, origem). Fica guardado para abrir sem internet.
export type DetalheBacklog = {
  criada_por: string | null; informado_por: string | null; trecho: string | null; regiao: string | null;
  observacao_supervisor: string | null; prazo: string | null; evento_localizado_em: string | null; evento_precisao_m: number | null;
  ponto: { categoria: string; identificacao: string | null; ocorrencia: string | null; observacao: string | null; via: string | null } | null;
  fotos: number;
};

export async function detalheBacklog(id: string, aoAtualizar: (d: DetalheBacklog) => void) {
  const chave = `backlog-detalhe-${id}`;
  const guardado = await AsyncStorage.getItem(chave).catch(() => null);
  if (guardado) aoAtualizar(JSON.parse(guardado));
  const { data, error } = await supabase.rpc('detalhe_backlog', { p_os: id });
  if (error || !data) return;
  await AsyncStorage.setItem(chave, JSON.stringify(data));
  aoAtualizar(data as DetalheBacklog);
}

// KMZ do backlog para abrir em app de mapa offline (Google Earth, Organic Maps...): um pin por O.S., cor pela idade.
export async function compartilharBacklogKmz(itens: ItemBacklog[]) {
  const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ESTILO = { verde: 'ff4a9e1e', amarelo: 'ff009ad9', vermelho: 'ff3b45d0' };
  const pins = itens.filter((b) => b.lat != null && b.lng != null).map((b) => {
    const idade = idadeOs(b.criado_em);
    return `<Placemark><name>#${b.numero} ${esc(b.titulo)}</name><styleUrl>#${idade.nivel}</styleUrl>
<description>${esc(`${b.tipo} · prioridade ${b.prioridade} · aberta há ${idade.texto}${b.ticket_acionamento ? ` · ticket ${b.ticket_acionamento}` : ''}\n${b.endereco ?? ''}\n${b.descricao ?? ''}`)}</description>
<Point><coordinates>${b.lng},${b.lat},0</coordinates></Point></Placemark>`;
  });
  const estilos = Object.entries(ESTILO).map(([n, c]) =>
    `<Style id="${n}"><IconStyle><color>${c}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`).join('');
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Backlog Técnico Plus</name>${estilos}${pins.join('')}</Document></kml>`;
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const destino = new File(Paths.cache, 'Backlog.kmz');
  if (destino.exists) destino.delete();
  destino.create();
  await destino.write(bytes);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/vnd.google-earth.kmz', dialogTitle: 'Abrir backlog no mapa' });
}

// O.S. abertas a até 200 m de um ponto (para não informar a mesma ocorrência duas vezes).
// Sem internet, confere só o backlog guardado no celular.
export type Proxima = { id: string; numero: number; titulo: string; tipo: string; criado_em: string; distancia_m: number; tecnico: string | null };
export async function ocorrenciasProximas(lat: number, lng: number): Promise<Proxima[]> {
  const { data, error } = await supabase.rpc('ocorrencias_proximas', { p_lat: lat, p_lng: lng, p_raio: 200 });
  if (!error && data) return data as Proxima[];
  return (await backlogGuardado())
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({ ...b, distancia_m: distanciaKm({ lat, lng }, { lat: b.lat!, lng: b.lng! }) * 1000, tecnico: null }))
    .filter((b) => b.distancia_m <= 200)
    .sort((a, b) => a.distancia_m - b.distancia_m);
}
