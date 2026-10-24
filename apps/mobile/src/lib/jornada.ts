import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { enfileirar } from './fila';
import { posicaoAtual } from './localizacao';
import { iniciarRastreio, pararRastreio } from './rastreio';
import { ponto, supabase } from './supabase';

// Estado do dia guardado no celular, para o técnico abrir e fechar expediente e refeição sem internet.
export type Jornada = {
  expedienteId: string | null;
  inicioExpediente: string | null;
  kmInicial: number | null;
  inicioRefeicao: string | null;
};

const CHAVE = 'jornada-atual';
const VAZIA: Jornada = { expedienteId: null, inicioExpediente: null, kmInicial: null, inicioRefeicao: null };

export async function lerJornada(): Promise<Jornada> {
  const local = await AsyncStorage.getItem(CHAVE);
  if (local) return JSON.parse(local);
  // Primeiro acesso no aparelho: busca no servidor.
  const [exp, ref] = await Promise.all([
    supabase.from('expedientes').select('id, inicio, km_inicial').is('fim', null).maybeSingle(),
    supabase.from('refeicoes').select('inicio').is('fim', null).maybeSingle(),
  ]);
  const jornada: Jornada = exp.data
    ? { expedienteId: exp.data.id, inicioExpediente: exp.data.inicio, kmInicial: exp.data.km_inicial, inicioRefeicao: ref.data?.inicio ?? null }
    : VAZIA;
  await AsyncStorage.setItem(CHAVE, JSON.stringify(jornada));
  return jornada;
}

async function gravar(j: Jornada) {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(j));
  return j;
}

export async function iniciarExpediente(kmInicial: number) {
  const pos = await posicaoAtual();
  const id = randomUUID();
  const inicio = new Date().toISOString();
  await enfileirar({
    tipo: 'inserir',
    tabela: 'expedientes',
    linha: { id, inicio, km_inicial: kmInicial, posicao_inicio: pos ? ponto(pos.latitude, pos.longitude) : null },
  });
  // Primeiro ponto do trajeto já no início, para o técnico aparecer no mapa mesmo parado.
  if (pos) {
    await enfileirar({
      tipo: 'inserirVarios',
      tabela: 'posicoes_gps',
      linhas: [{ expediente_id: id, registrado_em: inicio, posicao: ponto(pos.latitude, pos.longitude), precisao_m: pos.accuracy }],
    });
  }
  const jornada = await gravar({ expedienteId: id, inicioExpediente: inicio, kmInicial, inicioRefeicao: null });
  const rastreando = await iniciarRastreio();
  return { jornada, rastreando };
}

export async function encerrarExpediente(j: Jornada, kmFinal: number) {
  if (!j.expedienteId) return j;
  if (j.inicioRefeicao) await encerrarRefeicao(j);
  await pararRastreio();
  const pos = await posicaoAtual();
  await enfileirar({
    tipo: 'atualizar',
    tabela: 'expedientes',
    linhaId: j.expedienteId,
    campos: { fim: new Date().toISOString(), km_final: kmFinal, posicao_fim: pos ? ponto(pos.latitude, pos.longitude) : null },
  });
  return gravar(VAZIA);
}

// A refeição vale mesmo com uma O.S. em execução: o banco pausa a O.S. e retoma depois.
export async function iniciarRefeicao(j: Jornada) {
  const pos = await posicaoAtual();
  const inicio = new Date().toISOString();
  await enfileirar({
    tipo: 'rpc',
    nome: 'iniciar_refeicao',
    args: { inicio, latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null },
  });
  return gravar({ ...j, inicioRefeicao: inicio });
}

export async function encerrarRefeicao(j: Jornada) {
  await enfileirar({ tipo: 'rpc', nome: 'encerrar_refeicao', args: { fim: new Date().toISOString() } });
  return gravar({ ...j, inicioRefeicao: null });
}

export const limparJornadaLocal = () => AsyncStorage.removeItem(CHAVE);
