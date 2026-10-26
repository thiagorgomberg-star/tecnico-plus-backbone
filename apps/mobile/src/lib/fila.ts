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
      tipoAnexo: 'foto_antes' | 'foto_depois' | 'foto_caixa' | 'foto_otdr' | 'foto_bandeja' | 'foto_olt' | 'foto_ponto' | 'assinatura';
      descricao?: string;
      caixaId?: string;
      pontoId?: string; // poste/ocorrência da Vistoria Backbone MG
      fibra?: number;
      bandeja?: number;
      arquivo: string;
      largura: number;
      altura: number;
      tiradaEm: string;
      latitude: number | null;
      longitude: number | null;
    }
  | {
      tipo: 'despesa';
      id: string;
      linha: Record<string, unknown> & { id: string; tecnico_id: string };
      arquivo: string | null;
      extensao: string;
      correcao?: boolean; // reenvio de uma despesa recusada: atualiza a mesma linha
    }
  | {
      tipo: 'inventario';
      id: string;
      // Inspeção do Inventário Matinal: foto do item + condição.
      linha: { id: string; ferramenta_id: string; tecnico_id: string; feita_em: string; condicao: string; observacao: string | null; posicao: string | null };
      arquivo: string;
    }
  | { tipo: 'os'; id: string; osId: string; campos: Record<string, unknown> }
  | { tipo: 'inserir'; id: string; tabela: string; linha: Record<string, unknown>; conflito?: string }
  | { tipo: 'excluir'; id: string; tabela: string; filtros: Record<string, string> }
  | { tipo: 'inserirVarios'; id: string; tabela: string; linhas: Record<string, unknown>[] }
  | { tipo: 'atualizar'; id: string; tabela: string; linhaId: string; campos: Record<string, unknown> }
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
        largura_px: item.largura || null,
        altura_px: item.altura || null,
        descricao: item.descricao ?? null,
        tirada_em: item.tiradaEm,
        caixa_id: item.caixaId ?? null,
        ...(item.pontoId ? { ponto_id: item.pontoId } : {}),
        fibra: item.fibra ?? null,
        ...(item.bandeja ? { bandeja: item.bandeja } : {}),
        posicao:
          item.latitude != null && item.longitude != null
            ? `SRID=4326;POINT(${item.longitude} ${item.latitude})`
            : null,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
    new File(item.arquivo).delete();
  } else if (item.tipo === 'despesa') {
    // Comprovante primeiro (caminho único por envio); a linha leva o id gerado no celular, então reenviar não duplica.
    const linha: Record<string, unknown> = { ...item.linha };
    if (item.arquivo) {
      const comprovante = `${item.linha.tecnico_id}/${item.id}.${item.extensao}`;
      linha.comprovante = comprovante;
      const conteudo = await new File(item.arquivo).arrayBuffer();
      const envio = await supabase.storage.from('despesas').upload(comprovante, conteudo, {
        contentType: item.extensao === 'pdf' ? 'application/pdf' : item.extensao === 'png' ? 'image/png' : 'image/jpeg',
      });
      // Já existe = subiu numa tentativa anterior que caiu antes de gravar a linha.
      if (envio.error && !/exist|duplicate/i.test(envio.error.message)) throw envio.error;
    }
    const { error } = await supabase.from('despesas')
      .upsert(linha, { onConflict: 'id', ignoreDuplicates: !item.correcao });
    if (error) throw error;
    if (item.arquivo) new File(item.arquivo).delete();
  } else if (item.tipo === 'inventario') {
    const foto = `${item.linha.tecnico_id}/${item.linha.id}.jpg`;
    const conteudo = await new File(item.arquivo).arrayBuffer();
    const envio = await supabase.storage.from('inventario').upload(foto, conteudo, { contentType: 'image/jpeg' });
    if (envio.error && !/exist|duplicate/i.test(envio.error.message)) throw envio.error;
    const { error } = await supabase.from('inventario_inspecoes')
      .upsert({ ...item.linha, foto }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    new File(item.arquivo).delete();
  } else if (item.tipo === 'os') {
    const { error } = await supabase.from('ordens_servico').update(item.campos).eq('id', item.osId);
    if (error) throw error;
  } else if (item.tipo === 'inserir') {
    // A linha já leva o id gerado no celular; reenviar não duplica.
    const { error } = await supabase.from(item.tabela).upsert(item.linha, { onConflict: item.conflito ?? 'id', ignoreDuplicates: true });
    if (error) throw error;
  } else if (item.tipo === 'excluir') {
    let consulta = supabase.from(item.tabela).delete();
    for (const [coluna, valor] of Object.entries(item.filtros)) consulta = consulta.eq(coluna, valor);
    const { error } = await consulta;
    if (error) throw error;
  } else if (item.tipo === 'inserirVarios') {
    const { error } = await supabase.from(item.tabela).insert(item.linhas);
    if (error) throw error;
  } else if (item.tipo === 'atualizar') {
    const { error } = await supabase.from(item.tabela).update(item.campos).eq('id', item.linhaId);
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
        // Regra do banco recusou (ex.: mudança de status não permitida): guarda para revisão e segue a fila.
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
