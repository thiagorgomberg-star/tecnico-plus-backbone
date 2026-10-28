import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as Network from 'expo-network';
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
      linha: { id: string; ferramenta_id: string; tecnico_id: string; feita_em: string; condicao: string; observacao: string | null; posicao: string | null;
        numero_serie?: string | null };
      arquivo: string;
      arquivoSerial?: string; // foto da plaqueta com o número de série
    }
  | { tipo: 'os'; id: string; osId: string; campos: Record<string, unknown> }
  | { tipo: 'inserir'; id: string; tabela: string; linha: Record<string, unknown>; conflito?: string }
  | { tipo: 'excluir'; id: string; tabela: string; filtros: Record<string, string> }
  | { tipo: 'inserirVarios'; id: string; tabela: string; linhas: Record<string, unknown>[] }
  | { tipo: 'atualizar'; id: string; tabela: string; linhaId: string; campos: Record<string, unknown> }
  | { tipo: 'rpc'; id: string; nome: string; args: Record<string, unknown> }
  // KMZ de rota inserido para localizar rompimento: arquivo + traçado já lido.
  | { tipo: 'kmz'; id: string; kmzId: string; rotaId: string; nome: string; arquivo: string; tracado: unknown; extensao_m: number | null };

type NovoItem = ItemFila extends infer T ? (T extends ItemFila ? Omit<T, 'id'> : never) : never;
// Quando entrou na fila (itens antigos, de antes desta versão, não têm).
const entrouEm = (i: ItemFila) => (i as { em?: string }).em;

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
  const id = randomUUID();
  itens.push({ ...item, id, em: new Date().toISOString() } as unknown as ItemFila);
  await gravar(itens);
  sincronizar();
  return id;
}

// Legenda de foto antes/depois (balão "+"). Vai como ação no fim da fila, então sobe depois da própria foto.
export async function legendarFoto(caminho: string, legenda: string) {
  await enfileirar({ tipo: 'rpc', nome: 'legendar_foto_os', args: { p_caminho: caminho, p_legenda: legenda.trim() } });
}
export const caminhoFotoOs = (osId: string, filaId: string) => `${osId}/${filaId}.jpg`;

export const itensPendentes = ler;

// Recusados pelo banco (regra não permitiu): ficam guardados para o técnico ver, reenviar ou descartar.
export type Recusado = { item: ItemFila; erro: string; em: string };
export async function itensRecusados(): Promise<Recusado[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CHAVE_RECUSADOS)) ?? '[]'); } catch { return []; }
}
async function gravarRecusados(r: Recusado[]) {
  await AsyncStorage.setItem(CHAVE_RECUSADOS, JSON.stringify(r));
  ouvintes.forEach((f) => f());
}
export async function reenviarRecusado(indice: number) {
  const r = await itensRecusados();
  const [x] = r.splice(indice, 1);
  if (!x) return;
  await gravarRecusados(r);
  await gravar([...(await ler()), x.item]);
  sincronizar();
}
export async function descartarRecusado(indice: number) {
  const r = await itensRecusados();
  r.splice(indice, 1);
  await gravarRecusados(r);
}

const ROTULO_FOTO: Record<string, string> = {
  foto_antes: 'Foto antes', foto_depois: 'Foto depois', foto_caixa: 'Foto da caixa', foto_otdr: 'Foto do OTDR', foto_bandeja: 'Foto da bandeja',
  foto_olt: 'Foto da OLT', foto_ponto: 'Foto da vistoria', assinatura: 'Assinatura',
};
const ROTULO_TABELA: Record<string, string> = {
  caixas_emenda: 'Caixa / elemento', caixa_fibras: 'Fibras da caixa', caixa_manobras: 'Manobras', vistoria_pontos: 'Ponto da vistoria',
  os_servicos_executados: 'Serviço executado', os_tecnicos_apoio: 'Técnico de apoio', rastreio_pontos: 'Trajeto (GPS)', eventos_os: 'Evento da O.S.',
};
// Texto curto do que é cada item da fila, para o técnico entender o que ainda não subiu.
export function descreverItem(i: ItemFila) {
  switch (i.tipo) {
    case 'foto': return `${ROTULO_FOTO[i.tipoAnexo] ?? 'Foto'}${i.bandeja ? ` · bandeja ${i.bandeja}` : ''}${i.fibra ? ` · fibra ${i.fibra}` : ''}`;
    case 'despesa': return i.correcao ? 'Correção de despesa' : 'Despesa';
    case 'inventario': return 'Inventário (foto de ferramenta)';
    case 'os': return 'Atualização da O.S.';
    case 'kmz': return `KMZ da rota · ${i.nome}`;
    case 'rpc': return i.nome === 'excluir_foto_caixa' || i.nome === 'excluir_foto_os' ? 'Exclusão de foto' : i.nome === 'legendar_foto_os' ? 'Legenda de foto' : 'Ação no servidor';
    case 'excluir': return `Exclusão · ${ROTULO_TABELA[i.tabela] ?? i.tabela}`;
    default: return ROTULO_TABELA[i.tabela] ?? i.tabela;
  }
}

// Tira da fila um item que ainda não subiu (ex.: foto tirada errado).
export async function removerDaFila(id: string) {
  await gravar((await ler()).filter((i) => i.id !== id));
}
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
    let fotoSerial: string | null = null;
    if (item.arquivoSerial && new File(item.arquivoSerial).exists) {
      fotoSerial = `${item.linha.tecnico_id}/${item.linha.id}-serial.jpg`;
      const r = await supabase.storage.from('inventario').upload(fotoSerial, await new File(item.arquivoSerial).arrayBuffer(), { contentType: 'image/jpeg' });
      if (r.error && !/exist|duplicate/i.test(r.error.message)) throw r.error;
    }
    const { error } = await supabase.from('inventario_inspecoes')
      .upsert({ ...item.linha, foto, foto_serial: fotoSerial }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    new File(item.arquivo).delete();
    if (item.arquivoSerial) try { new File(item.arquivoSerial).delete(); } catch { /* já removida */ }
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
  } else if (item.tipo === 'kmz') {
    const caminho = `${item.rotaId}/${item.kmzId}.${/\.kml$/i.test(item.nome) ? 'kml' : 'kmz'}`;
    const arq = new File(item.arquivo);
    if (arq.exists) {
      const envio = await supabase.storage.from('kmz').upload(caminho, await arq.arrayBuffer(), { contentType: 'application/vnd.google-earth.kmz' });
      if (envio.error && !/exist|duplicate/i.test(envio.error.message)) throw envio.error;
    }
    const { error } = await supabase.from('rota_kmz').upsert({
      id: item.kmzId, rota_id: item.rotaId, nome_arquivo: item.nome, caminho_arquivo: arq.exists ? caminho : null, tracado: item.tracado, extensao_m: item.extensao_m,
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    if (arq.exists) arq.delete();
  } else {
    const { error } = await supabase.rpc(item.nome, item.args);
    if (error) throw error;
  }
}

// Erro com código SQLSTATE (5 caracteres) veio do banco; recusa do storage (4xx, ex.: permissão) também.
// Sem código é falta de rede. Recusado não trava a fila: vai para revisão e o resto (GPS, O.S.) segue.
function recusadoPeloBanco(e: unknown) {
  const erro = e as { code?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof erro?.code === 'string' && erro.code.length === 5) return true;
  const http = Number(erro?.status ?? erro?.statusCode);
  return http >= 400 && http < 500 && ![401, 408, 429].includes(http); // 401 = sessão vencida: espera renovar
}

// Opção do técnico: fotos só sobem no Wi-Fi (economiza o plano de dados). O resto da fila (GPS, O.S.) segue no 4G.
const CHAVE_SO_WIFI = 'fotos-so-wifi';
export async function fotosSoWifi() {
  return (await AsyncStorage.getItem(CHAVE_SO_WIFI)) === '1';
}
export async function definirFotosSoWifi(ligado: boolean) {
  await AsyncStorage.setItem(CHAVE_SO_WIFI, ligado ? '1' : '0');
  ouvintes.forEach((f) => f());
  sincronizar();
}
export const ehFoto = (i: ItemFila) => i.tipo === 'foto' || i.tipo === 'inventario';
// Segurando as fotos agora? (opção ligada e celular fora do Wi-Fi)
export async function segurandoFotos() {
  if (!(await fotosSoWifi())) return false;
  try {
    return (await Network.getNetworkStateAsync()).type !== Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

// Conta ao servidor como está a fila deste celular (no máximo a cada 2 min), para o supervisor ver fila travada no painel.
let ultimoInforme = 0;
async function informarSituacao(segurando: boolean) {
  if (Date.now() - ultimoInforme < 120_000) return;
  ultimoInforme = Date.now();
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const itens = await ler();
    const datas = itens.map(entrouEm).filter((d): d is string => !!d).sort();
    await supabase.from('fila_status').upsert({
      usuario_id: data.session.user.id, pendentes: itens.length, fotos: itens.filter(ehFoto).length,
      recusados: (await itensRecusados()).length, mais_antigo: datas[0] ?? null, ultimo_erro: ultimoErro,
      segurando_wifi: segurando, atualizado_em: new Date().toISOString(),
    });
  } catch {
    // sem sinal: informa na próxima
  }
}

export async function sincronizar() {
  if (enviando) return;
  enviando = true;
  try {
    const segurar = await segurandoFotos();
    const pulados = new Set<string>();
    for (;;) {
      const item = (await ler()).find((i) => !pulados.has(i.id));
      if (!item) break;
      if (segurar && ehFoto(item)) {
        pulados.add(item.id);
        continue;
      }
      try {
        await enviar(item);
        ultimoErro = null;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e);
        if (!recusadoPeloBanco(e)) {
          ouvintes.forEach((f) => f());
          informarSituacao(segurar);
          return; // sem internet: tenta de novo no próximo ciclo
        }
        // Regra do banco recusou (ex.: mudança de status não permitida): guarda para revisão e segue a fila.
        const recusados = JSON.parse((await AsyncStorage.getItem(CHAVE_RECUSADOS)) ?? '[]');
        recusados.push({ item, erro: ultimoErro, em: new Date().toISOString() });
        await AsyncStorage.setItem(CHAVE_RECUSADOS, JSON.stringify(recusados));
      }
      await gravar((await ler()).filter((i) => i.id !== item.id));
    }
    informarSituacao(segurar);
  } finally {
    enviando = false;
  }
}

setInterval(sincronizar, 30_000);
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') sincronizar();
});
