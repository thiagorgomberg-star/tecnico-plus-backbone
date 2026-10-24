import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { enfileirar } from './fila';
import { posicaoAtual } from './localizacao';
import { iniciarRastreio, pararRastreio } from './rastreio';
import { ponto, supabase } from './supabase';
import { meuVeiculo } from './veiculo';

// Estado do dia guardado no celular, para o técnico abrir e fechar expediente e refeição sem internet.
export type Jornada = {
  expedienteId: string | null;
  inicioExpediente: string | null;
  kmInicial: number | null;
  inicioRefeicao: string | null;
  // Uma refeição por expediente: depois de encerrada, o botão some.
  refeicaoFeita?: boolean;
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
  const feita = exp.data
    ? await supabase.from('refeicoes').select('id', { count: 'exact', head: true }).eq('expediente_id', exp.data.id).not('fim', 'is', null)
    : null;
  const jornada: Jornada = exp.data
    ? { expedienteId: exp.data.id, inicioExpediente: exp.data.inicio, kmInicial: exp.data.km_inicial, inicioRefeicao: ref.data?.inicio ?? null,
      refeicaoFeita: (feita?.count ?? 0) > 0 }
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
  await AsyncStorage.setItem(CHAVE_ULTIMO_KM, String(kmInicial));
  const jornada = await gravar({ expedienteId: id, inicioExpediente: inicio, kmInicial, inicioRefeicao: null });
  const rastreando = await iniciarRastreio();
  return { jornada, rastreando };
}

// Último km conhecido: o maior entre o fim do último expediente (guardado no celular) e o do veículo vinculado.
const CHAVE_ULTIMO_KM = 'ultimo-km';
export async function ultimoKm(): Promise<number | null> {
  const [local, veiculo] = await Promise.all([
    AsyncStorage.getItem(CHAVE_ULTIMO_KM).then((v) => (v ? Number(v) : null)),
    meuVeiculo(false).catch(() => null),
  ]);
  const kms = [local, veiculo?.km_atual ?? null].filter((n): n is number => n != null && Number.isFinite(n));
  return kms.length ? Math.max(...kms) : null;
}

export async function encerrarExpediente(j: Jornada, kmFinal: number) {
  if (!j.expedienteId) return j;
  await AsyncStorage.setItem(CHAVE_ULTIMO_KM, String(kmFinal));
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
  return gravar({ ...j, inicioRefeicao: null, refeicaoFeita: true });
}

export const limparJornadaLocal = () => AsyncStorage.removeItem(CHAVE);
