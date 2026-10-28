import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { dataUrl } from './relatorioPdf';
import { supabase } from './supabase';
import { OrdemServico } from './tipos';
import { descreverVeiculo, meuVeiculo } from './veiculo';

// O.S. de apresentação: documento curto para o técnico mostrar se for abordado pela polícia.
// Empresa, técnico (documento), veículo e o serviço que ele está indo fazer. Funciona sem internet (usa o que ficou guardado).

type Empresa = { razao_social: string | null; cnpj: string | null; endereco: string | null; telefone: string | null; responsavel: string | null; contratante: string | null };
type Tecnico = { nome: string; cargo: string | null; matricula: string | null; documento: string | null; cpf: string | null; rg: string | null };
type Auxiliar = { nome: string; cargo: string | null; cpf: string | null; rg: string | null };

async function comCache<T>(chave: string, buscar: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await buscar();
    if (!error && data) {
      await AsyncStorage.setItem(chave, JSON.stringify(data));
      return data;
    }
  } catch {
    // sem internet: usa o guardado
  }
  const c = await AsyncStorage.getItem(chave);
  return c ? JSON.parse(c) : null;
}

const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const TIPOS: Record<string, string> = {
  corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva', preventiva_site: 'Preventiva de site',
  roteamento_fibras: 'Roteamento de fibras', vistoria_rota: 'Vistoria de rota',
};

export async function compartilharOsApresentacao(os: Pick<OrdemServico, 'id' | 'numero' | 'tipo' | 'titulo' | 'endereco' | 'ticket_acionamento'> & Partial<Pick<OrdemServico, 'os_clientes'>>) {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao.session?.user.id ?? '';
  const [empresa, tecnico, veiculo, auxiliares] = await Promise.all([
    comCache<Empresa>('config-empresa', () => supabase.from('config_empresa').select('razao_social, cnpj, endereco, telefone, responsavel, contratante').maybeSingle()),
    comCache<Tecnico>('meu-perfil-documento', () => supabase.from('usuarios').select('nome, cargo, matricula, documento, cpf, rg').eq('id', uid).maybeSingle()),
    meuVeiculo().catch(() => meuVeiculo(false)),
    comCache<Auxiliar[]>('meus-auxiliares', () => supabase.rpc('meus_auxiliares')),
  ]);
  // Tickets de acionamento dos clientes (um por cliente); o gerado pelo sistema (ticket interno) não vai para o documento.
  const doBanco = os.numero ? await supabase.from('ordens_servico').select('ticket_interno, os_clientes(ticket, cliente:clientes(nome))').eq('id', os.id).maybeSingle()
    .then(({ data }) => data as { ticket_interno: boolean | null; os_clientes: { ticket: string | null; cliente: { nome: string } | null }[] } | null, () => null) : null;
  const tickets = (doBanco?.os_clientes ?? os.os_clientes ?? []).flatMap((c) => (c.ticket?.trim() ? [{ cliente: c.cliente?.nome ?? null, ticket: c.ticket.trim() }] : []));
  if (!tickets.length && os.ticket_acionamento && !doBanco?.ticket_interno) tickets.push({ cliente: null, ticket: os.ticket_acionamento });
  const documentos = (p: { cpf: string | null; rg: string | null; documento?: string | null } | null) =>
    [p?.cpf ? `CPF ${p.cpf}` : null, p?.rg ? `RG ${p.rg}` : null].filter(Boolean).join(' · ') || p?.documento || null;
  const logo = await Asset.fromModule(require('../../assets/mascara/logo-multivale.png')).downloadAsync()
    .then((a) => (a.localUri ? dataUrl(a.localUri) : null)).catch(() => null);
  const agora = new Date();
  const linha = (rotulo: string, valor: string | null | undefined) =>
    `<tr><th>${rotulo}</th><td>${esc(valor) || '—'}</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:28px;font-size:12pt}
  header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0572CE;padding-bottom:10px}
  header img{height:52px} h1{font-size:18pt;margin:0} .sub{color:#555;font-size:10pt}
  h2{font-size:12pt;margin:18px 0 6px;color:#0572CE;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse} th{width:34%;text-align:left;color:#555;font-weight:600;padding:5px 6px;vertical-align:top}
  td{padding:5px 6px;font-weight:600} tr:nth-child(odd){background:#F3F6FA}
  .aviso{margin-top:18px;padding:10px;border:1px solid #0572CE;border-radius:6px;background:#EEF5FD;font-size:11pt}
  .placa{font-family:monospace;font-size:15pt;letter-spacing:2px}
  </style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div><h1>Ordem de Serviço Nº ${os.numero || '—'}</h1>
  <div class="sub">Documento de apresentação do técnico em serviço · emitido em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div></div></header>

  <h2>Empresa</h2><table>
  ${linha('Razão social', empresa?.razao_social ?? 'Multivale Engenharia')}
  ${linha('CNPJ', empresa?.cnpj)}
  ${linha('Endereço', empresa?.endereco)}
  ${empresa?.contratante ? linha('Serviço prestado para', empresa.contratante) : ''}
  ${linha('Responsável', empresa?.responsavel)}
  ${linha('Telefone para confirmação', empresa?.telefone)}
  </table>

  <h2>Técnico</h2><table>
  ${linha('Nome', tecnico?.nome)}
  ${linha('Cargo', tecnico?.cargo)}
  ${tecnico?.matricula ? linha('Matrícula', tecnico.matricula) : ''}
  ${linha('Documento', documentos(tecnico))}
  </table>
  ${(auxiliares ?? []).map((a) => `<h2>Auxiliar</h2><table>${linha('Nome', a.nome)}${linha('Cargo', a.cargo)}${linha('Documento', documentos(a))}</table>`).join('')}

  <h2>Veículo</h2><table>
  ${veiculo ? `<tr><th>Placa</th><td class="placa">${esc(veiculo.placa)}</td></tr>
  ${linha('Marca / modelo', [veiculo.marca, veiculo.modelo].filter(Boolean).join(' '))}
  ${linha('Cor', veiculo.cor)}` : linha('Veículo', 'não vinculado')}
  </table>

  <h2>Serviço</h2><table>
  ${linha('Tipo', TIPOS[os.tipo] ?? os.tipo)}
  ${linha('Atividade', os.titulo)}
  ${linha('Local / endereço', os.endereco)}
  ${tickets.map((t) => linha(t.cliente ? `Ticket de acionamento · ${t.cliente}` : 'Ticket de acionamento', t.ticket)).join('')}
  </table>

  <div class="aviso">O técnico acima está a serviço da empresa, realizando manutenção da rede de fibra óptica (backbone) no local indicado.
  Em caso de dúvida, ligue para o telefone de confirmação.${veiculo ? ` Veículo: ${esc(descreverVeiculo(veiculo))}.` : ''}</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  const destino = new File(Paths.cache, `OS-${os.numero || os.id.slice(0, 8)}-apresentacao.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', dialogTitle: `O.S. ${os.numero || ''} (apresentação)`, UTI: 'com.adobe.pdf' });
}
