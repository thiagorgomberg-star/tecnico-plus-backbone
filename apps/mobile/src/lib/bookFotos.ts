import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import { supabase } from './supabase';

type Anexo = { caminho_arquivo: string; tipo: string; caixa_id: string | null; descricao: string | null; tirada_em: string | null; criado_em: string };

const limpar = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
const ROTULO: Record<string, string> = { foto_antes: 'Antes', foto_depois: 'Depois' };

// Book de fotos da O.S.: .zip com todas as fotos já enviadas (com a máscara), em pastas Antes, Depois e por caixa.
// Precisa de sinal (as fotos vêm do servidor). Devolve quantas fotos entraram.
export async function compartilharBookFotos(os: { id: string; numero: number }, aoProgresso?: (texto: string) => void) {
  const { data, error } = await supabase.from('os_anexos').select('caminho_arquivo, tipo, caixa_id, descricao, tirada_em, criado_em')
    .eq('os_id', os.id).like('tipo', 'foto%').order('tirada_em', { nullsFirst: false }).order('criado_em');
  if (error) throw error;
  const fotos = (data ?? []) as Anexo[];
  if (!fotos.length) return 0;
  const idsCaixa = [...new Set(fotos.flatMap((f) => (f.caixa_id ? [f.caixa_id] : [])))];
  const nomesCaixa = new Map<string, string>();
  if (idsCaixa.length) {
    const { data: cx } = await supabase.from('caixas_mapa').select('id, identificacao').in('id', idsCaixa);
    for (const c of cx ?? []) nomesCaixa.set(c.id, c.identificacao);
  }
  const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(fotos.map((f) => f.caminho_arquivo), 3600);
  const zip = new JSZip();
  const contagem = new Map<string, number>();
  let feitas = 0;
  for (const [i, f] of fotos.entries()) {
    aoProgresso?.(`${i + 1}/${fotos.length}`);
    const url = urls?.[i]?.signedUrl;
    if (!url) continue;
    const resp = await fetch(url).catch(() => null);
    if (!resp?.ok) continue;
    const pasta = f.caixa_id ? `Caixa ${limpar(nomesCaixa.get(f.caixa_id) ?? f.caixa_id.slice(0, 8))}` : ROTULO[f.tipo] ?? 'Outras';
    const n = (contagem.get(pasta) ?? 0) + 1;
    contagem.set(pasta, n);
    const quando = new Date(f.tirada_em ?? f.criado_em).toLocaleString('pt-BR').replace(/[/:]/g, '-').replace(',', '');
    const nome = [String(n).padStart(2, '0'), quando, f.descricao ? limpar(f.descricao) : null].filter(Boolean).join(' - ');
    zip.file(`${pasta}/${nome}.jpg`, new Uint8Array(await resp.arrayBuffer()));
    feitas++;
  }
  if (!feitas) return 0;
  aoProgresso?.('compactando');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const destino = new File(Paths.cache, `Book-fotos-OS-${os.numero}.zip`);
  if (destino.exists) destino.delete();
  destino.create();
  await destino.write(bytes);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/zip', dialogTitle: `Book de fotos · O.S. ${os.numero}` });
  return feitas;
}
