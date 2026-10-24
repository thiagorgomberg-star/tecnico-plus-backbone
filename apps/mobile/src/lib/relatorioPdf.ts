import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { itensPendentes } from './fila';
import { supabase } from './supabase';
import { OrdemServico, rotuloStatus } from './tipos';

type Item = { id: string; nome: string; unidade: string; categoria: 'servico' | 'material' };
type Lancamento = { item_id: string; quantidade: number; observacao: string | null };
type Pessoa = { id: string; nome: string };
type Foto = { src: string; tiradaEm: string | null };

const esc = (t: unknown) =>
  String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const quando = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Imagem embutida no PDF (funciona para arquivo do celular e para link do servidor).
async function dataUrl(uri: string) {
  try {
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string | null>((ok) => {
      const leitor = new FileReader();
      leitor.onloadend = () => ok(typeof leitor.result === 'string' ? leitor.result : null);
      leitor.onerror = () => ok(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function lerCache<T>(chave: string, padrao: T): Promise<T> {
  try {
    const texto = await AsyncStorage.getItem(chave);
    return texto ? JSON.parse(texto) : padrao;
  } catch {
    return padrao;
  }
}

// Monta o relatório da O.S. no próprio celular (sem internet usa o que está guardado nele)
// e abre o compartilhamento do Android para enviar o PDF pelo WhatsApp.
export async function compartilharRelatorio(os: OrdemServico) {
  const [catalogo, tecnicos, execucao, pendentes] = await Promise.all([
    lerCache<Item[]>('catalogo-execucao', []),
    lerCache<Pessoa[]>('tecnicos-ativos', []),
    lerCache<{ lancamentos: Lancamento[]; apoio: string[] }>(`execucao-${os.id}`, { lancamentos: [], apoio: [] }),
    itensPendentes(),
  ]);
  const nomeDe = (id: string | null | undefined) => tecnicos.find((t) => t.id === id)?.nome ?? '';
  const itemDe = new Map(catalogo.map((c) => [c.id, c]));

  // Dados que só o servidor tem (datas, fotos já enviadas); sem internet o relatório sai sem eles.
  const [{ data: completa }, { data: anexos }] = await Promise.all([
    supabase.from('ordens_servico')
      .select('criado_em, enviada_em, iniciada_em, concluida_em, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome, cargo), rota:rotas(trecho)')
      .eq('id', os.id).maybeSingle(),
    supabase.from('os_anexos').select('caminho_arquivo, tirada_em').eq('os_id', os.id)
      .in('tipo', ['foto_antes', 'foto_depois']).order('criado_em'),
  ]);
  const extra = completa as unknown as {
    criado_em: string; enviada_em: string | null; iniciada_em: string | null; concluida_em: string | null;
    tecnico: { nome: string; cargo: string | null } | null; rota: { trecho: string } | null;
  } | null;

  const fotos: Foto[] = [];
  if (anexos?.length) {
    const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(anexos.map((a) => a.caminho_arquivo), 600);
    const imagens = await Promise.all((urls ?? []).map((u) => (u.signedUrl ? dataUrl(u.signedUrl) : null)));
    imagens.forEach((src, i) => src && fotos.push({ src, tiradaEm: anexos[i].tirada_em }));
  }
  for (const p of pendentes) {
    if (p.tipo !== 'foto' || p.osId !== os.id) continue;
    const src = await dataUrl(p.arquivo);
    if (src) fotos.push({ src, tiradaEm: p.tiradaEm });
  }

  const logo = await Asset.fromModule(require('../../assets/mascara/logo-multivale.png')).downloadAsync()
    .then((a) => (a.localUri ? dataUrl(a.localUri) : null)).catch(() => null);

  const tecnico = extra?.tecnico?.nome ?? nomeDe(os.tecnico_id);
  const apoio = execucao.apoio.map(nomeDe).filter(Boolean);
  const tabela = (categoria: 'servico' | 'material', titulo: string) => {
    const linhas = execucao.lancamentos.filter((l) => itemDe.get(l.item_id)?.categoria === categoria);
    if (!linhas.length) return '';
    return `<h2>${titulo}</h2><table>${linhas.map((l) => {
      const item = itemDe.get(l.item_id)!;
      return `<tr><td>${esc(item.nome)}${l.observacao ? ` <span class="s">· ${esc(l.observacao)}</span>` : ''}</td>` +
        `<td class="d">${fmt(l.quantidade)} ${esc(item.unidade)}</td></tr>`;
    }).join('')}</table>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: sans-serif; font-size: 11pt; color: #1f2937; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    header img { height: 48px; } header .t { flex: 1; } header h1 { margin: 0; font-size: 16pt; }
    h2 { color: #0572CE; border-bottom: 2px solid #0572CE; font-size: 10pt; text-transform: uppercase; margin: 18px 0 6px; padding-bottom: 2px; }
    .g { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; } .l { color: #6b7280; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; } td { padding: 3px 0; border-bottom: 1px solid #eee; } .d { text-align: right; font-weight: bold; }
    .s { color: #6b7280; } .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .fotos img { width: 100%; border: 1px solid #ddd; } figure { margin: 0; break-inside: avoid; } figcaption { font-size: 8pt; color: #6b7280; }
    pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
  </style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div class="t"><h1>Relatório de atendimento</h1>
    <div class="s">O.S. #${esc(os.numero || '')} · ${esc(os.tipo)}</div></div>
    <div class="s" style="text-align:right;font-size:9pt">${os.ticket_acionamento ? `Ticket <b>${esc(os.ticket_acionamento)}</b><br>` : ''}Gerado em ${quando(new Date().toISOString())}</div>
  </header>
  <h2>Atividade</h2><b>${esc(os.titulo)}</b>
  <div class="g" style="margin-top:6px">
    <div><div class="l">Situação</div>${esc(rotuloStatus[os.status] ?? os.status)}</div>
    <div><div class="l">Trecho</div>${esc(extra?.rota?.trecho ?? '—')}</div>
    <div style="grid-column: span 2"><div class="l">Endereço / referência</div>${esc(os.endereco ?? '—')}</div>
    ${os.descricao ? `<div style="grid-column: span 2"><div class="l">Atividades</div><pre>${esc(os.descricao)}</pre></div>` : ''}
  </div>
  <h2>Equipe</h2><div class="g">
    <div><div class="l">Técnico responsável</div>${esc(tecnico || '—')}${extra?.tecnico?.cargo ? ` · ${esc(extra.tecnico.cargo)}` : ''}</div>
    <div><div class="l">Técnicos de apoio</div>${esc(apoio.join(', ') || '—')}</div>
  </div>
  ${extra ? `<h2>Tempos</h2><div class="g">
    <div><div class="l">Abertura</div>${quando(extra.criado_em)}</div><div><div class="l">Despacho</div>${quando(extra.enviada_em)}</div>
    <div><div class="l">Início em campo</div>${quando(extra.iniciada_em)}</div><div><div class="l">Conclusão</div>${quando(extra.concluida_em)}</div>
  </div>` : ''}
  ${tabela('servico', 'Serviços executados')}
  ${tabela('material', 'Materiais utilizados')}
  ${os.observacao_tecnico ? `<h2>Observações do técnico</h2><pre>${esc(os.observacao_tecnico)}</pre>` : ''}
  <h2>Registro fotográfico (${fotos.length})</h2>
  <div class="fotos">${fotos.map((f, i) => `<figure><img src="${f.src}"><figcaption>Foto ${i + 1} · ${quando(f.tiradaEm)}</figcaption></figure>`).join('')}</div>
  <p class="s" style="font-size:8pt;margin-top:16px;border-top:1px solid #ccc;padding-top:4px">Multivale Engenharia · Backbone · gerado pelo Técnico Plus</p>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  // Nome legível para quem recebe no WhatsApp.
  const destino = new File(Paths.cache, `Relatorio-OS-${os.numero || os.id.slice(0, 8)}.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Relatório O.S. ${os.numero || ''}`,
    UTI: 'com.adobe.pdf',
  });
}
