import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Caixa } from './caixas';
import { itensPendentes } from './fila';
import { calcularPlano, descreverFibra, descreverOlt, padroesPorExtenso, ehPonta, faixasDaBandeja, rotuloInstalacao, rotuloPonto, posicoesDgo, separarBandejas, svgMapaFusao } from './fusao';
import { descreverVeiculo, meuVeiculo } from './veiculo';
import { supabase } from './supabase';
import { OrdemServico, rotuloStatus } from './tipos';

type Item = { id: string; nome: string; unidade: string; categoria: 'servico' | 'material' };
type Lancamento = { item_id: string; quantidade: number; observacao: string | null };
type Pessoa = { id: string; nome: string };
type Foto = { src: string; tiradaEm: string | null; tipo: string; caixaId: string | null; fibra: number | null; bandeja?: number | null; descricao?: string | null };

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
  const [catalogo, tecnicos, execucao, pendentes, caixas] = await Promise.all([
    lerCache<Item[]>('catalogo-execucao', []),
    lerCache<Pessoa[]>('tecnicos-ativos', []),
    lerCache<{ lancamentos: Lancamento[]; apoio: string[] }>(`execucao-${os.id}`, { lancamentos: [], apoio: [] }),
    itensPendentes(),
    lerCache<Caixa[]>(`caixas-os-${os.id}`, []),
  ]);
  const nomeDe = (id: string | null | undefined) => tecnicos.find((t) => t.id === id)?.nome ?? '';
  const itemDe = new Map(catalogo.map((c) => [c.id, c]));

  // Dados que só o servidor tem (datas, fotos já enviadas); sem internet o relatório sai sem eles.
  const [{ data: completa }, { data: anexos }] = await Promise.all([
    supabase.from('ordens_servico')
      .select('criado_em, enviada_em, iniciada_em, concluida_em, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome, cargo), rota:rotas(trecho), veiculo:veiculos(placa, marca, modelo, cor)')
      .eq('id', os.id).maybeSingle(),
    supabase.from('os_anexos').select('caminho_arquivo, tirada_em, tipo, caixa_id, fibra, bandeja, descricao').eq('os_id', os.id)
      .in('tipo', ['foto_antes', 'foto_depois', 'foto_caixa', 'foto_otdr', 'foto_bandeja', 'foto_olt', 'assinatura']).order('criado_em'),
  ]);
  const extra = completa as unknown as {
    criado_em: string; enviada_em: string | null; iniciada_em: string | null; concluida_em: string | null;
    tecnico: { nome: string; cargo: string | null } | null; rota: { trecho: string } | null;
    veiculo: { placa: string; marca: string | null; modelo: string | null; cor: string | null } | null;
  } | null;
  // Sem internet (ou O.S. ainda não iniciada no servidor): usa o veículo vinculado guardado no celular.
  const veiculo = extra?.veiculo ?? await meuVeiculo(false);

  const fotos: Foto[] = [];
  if (anexos?.length) {
    const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(anexos.map((a) => a.caminho_arquivo), 600);
    const imagens = await Promise.all((urls ?? []).map((u) => (u.signedUrl ? dataUrl(u.signedUrl) : null)));
    imagens.forEach((src, i) => src && fotos.push({
      src, tiradaEm: anexos[i].tirada_em, tipo: anexos[i].tipo, caixaId: anexos[i].caixa_id, fibra: anexos[i].fibra, bandeja: anexos[i].bandeja, descricao: anexos[i].descricao,
    }));
  }
  for (const p of pendentes) {
    if (p.tipo !== 'foto' || p.osId !== os.id) continue;
    const src = await dataUrl(p.arquivo);
    if (src) fotos.push({ src, tiradaEm: p.tiradaEm, tipo: p.tipoAnexo, caixaId: p.caixaId ?? null, fibra: p.fibra ?? null, bandeja: p.bandeja ?? null, descricao: p.descricao ?? null });
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

  const fotosOs = fotos.filter((f) => f.tipo === 'foto_antes' || f.tipo === 'foto_depois');
  const assinatura = [...fotos].reverse().find((f) => f.tipo === 'assinatura');
  const secaoCaixas = caixas.map((c) => {
    const plano = calcularPlano(c);
    const ponta = ehPonta(c.tipo);
    const dgo = c.tipo === 'dgo';
    const daCaixa = fotos.filter((f) => f.caixaId === c.id);
    const manobras = c.manobras.map((m) =>
      `<tr><td>${esc(descreverFibra(m.fibra_entrada, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined))}</td><td>Saída ${m.saida}: ${esc(descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras, c.padrao_cores_saidas?.[m.saida - 1] ?? undefined))}</td><td>${esc(m.motivo ?? '—')}</td></tr>`).join('');
    const fibras = c.fibras.map((f) =>
      `<tr><td>${esc(descreverFibra(f.fibra, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined))}</td><td>${esc(f.cliente ?? '—')}</td>` +
      (dgo ? `<td>${esc(f.posicao_dgo ?? '—')}</td><td>${f.cordao_olt ? esc(descreverOlt(f)) : '—'}</td><td>${f.potencia_tx_dbm ?? '—'}</td><td>${f.potencia_rx_dbm ?? '—'}</td>`
        : ponta ? `<td>${f.potencia_dbm ?? '—'}</td>` : '') +
      (ponta ? `<td>${f.reflexao_db ?? '—'}</td><td>${f.perda_db_km ?? '—'}</td>` : '') +
      `<td>${f.sem_potencia ? '<b style="color:#dc2626">SEM POTÊNCIA</b>' : 'OK'}</td></tr>`).join('');
    return `<div style="break-inside:avoid-page">
      <h2>${esc(rotuloPonto(c.tipo))} ${esc(c.identificacao)}${rotuloInstalacao(c.instalacao) ? ` · ${rotuloInstalacao(c.instalacao)}` : ''}${c.parceiro ? ` · ${esc(c.parceiro)}` : ''}</h2>
      <div class="g">
        <div><div class="l">Vem de</div>${esc(c.origem ?? '—')}</div>
        <div><div class="l">Localização</div>${c.latitude != null ? `${c.latitude.toFixed(6)}, ${c.longitude!.toFixed(6)}` : '—'}</div>
        ${padroesPorExtenso(c) ? `<div style="grid-column: span 2"><div class="l">Padrão de cores</div>${esc(padroesPorExtenso(c))}</div>` : ''}
        ${c.bastidor ? `<div><div class="l">Bastidor</div>${esc(c.bastidor)}</div>` : ''}
        ${c.parceiro ? `<div><div class="l">Parceiro</div>${esc(c.parceiro)}</div>` : ''}
        <div style="grid-column: span 2"><div class="l">Endereço</div>${esc(c.endereco ?? '—')}</div>
        <div><div class="l">Plano de fusão</div>${c.capacidade_fibras} FO → ${c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(', ') || '—'}</div>
        <div><div class="l">Grupos</div>${c.grupos_fusionados} fusionados · ${c.grupos_vagos} vagos · ${plano.param} fibras param aqui</div>
      </div>
      ${c.observacao ? `<p><span class="l">Observação:</span> ${esc(c.observacao)}</p>` : ''}
      ${manobras ? `<p class="l" style="margin-top:8px">Manobras</p><table><tr class="l"><td>Fibra de entrada</td><td>Ligada a</td><td>Motivo</td></tr>${manobras}</table>` : ''}
      ${fibras ? `<p class="l" style="margin-top:8px">Fibras</p><table><tr class="l"><td>Fibra</td><td>Cliente</td>${dgo ? '<td>Posição DGO</td><td>OLT · SFP · cordão</td><td>TX / saída OLT dBm</td><td>RX dBm</td>' : ponta ? '<td>Sinal dBm</td>' : ''}${ponta ? '<td>Reflexão dB</td><td>Perda dB/km</td>' : ''}<td>Situação</td></tr>${fibras}</table>` : ''}
      ${c.saidas.length ? `<div style="margin-top:8px">${svgMapaFusao({ ...c, posicoes_dgo: posicoesDgo(caixas, c) })}</div>` : ''}
      ${separarBandejas(c).length ? `<p class="l" style="margin-top:8px">Bandejas (${c.fusoes_por_bandeja || 12} fusões por bandeja)</p><table><tr class="l"><td>Bandeja</td><td>Fusões</td><td>Fibras de entrada</td></tr>${
        separarBandejas(c).map((b) => `<tr><td>Bandeja ${b.numero}</td><td>${b.ligacoes.length}</td><td>${esc(faixasDaBandeja(b))}</td></tr>`).join('')}</table>` : ''}
      ${daCaixa.length ? `<div class="fotos" style="margin-top:8px">${daCaixa.map((f) =>
        `<figure><img src="${f.src}"><figcaption>${f.tipo === 'foto_otdr' ? `OTDR · fibra ${f.fibra}` : f.tipo === 'foto_olt' ? 'OLT e cordões' : f.tipo === 'foto_bandeja' ? `Bandeja ${f.bandeja} · fibras acomodadas` : dgo ? 'DGO' : 'Acomodação da caixa'} · ${quando(f.tiradaEm)}</figcaption></figure>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

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
    <div style="grid-column: span 2"><div class="l">Veículo</div>${esc(veiculo ? descreverVeiculo(veiculo) : '—')}</div>
  </div>
  ${extra ? `<h2>Tempos</h2><div class="g">
    <div><div class="l">Abertura</div>${quando(extra.criado_em)}</div><div><div class="l">Despacho</div>${quando(extra.enviada_em)}</div>
    <div><div class="l">Início em campo</div>${quando(extra.iniciada_em)}</div><div><div class="l">Conclusão</div>${quando(extra.concluida_em)}</div>
  </div>` : ''}
  ${tabela('servico', 'Serviços executados')}
  ${tabela('material', 'Materiais utilizados')}
  ${os.observacao_tecnico ? `<h2>Observações do técnico</h2><pre>${esc(os.observacao_tecnico)}</pre>` : ''}
  ${secaoCaixas}
  <h2>Registro fotográfico (${fotosOs.length})</h2>
  <div class="fotos">${fotosOs.map((f, i) => `<figure><img src="${f.src}"><figcaption>Foto ${i + 1} · ${quando(f.tiradaEm)}</figcaption></figure>`).join('')}</div>
  ${assinatura ? `<h2>Assinatura do responsável</h2><img src="${assinatura.src}" style="max-height:110px;border-bottom:1px solid #999">
    <div>${esc(assinatura.descricao ?? '')} · ${quando(assinatura.tiradaEm)}</div>` : ''}
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
