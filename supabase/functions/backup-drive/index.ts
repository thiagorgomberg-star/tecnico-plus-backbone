// Backup semanal no Google Drive do supervisor. Quem grava no Drive é o Apps Script dele (scripts/backup/apps-script.gs),
// que chama esta função com a chave guardada no Vault (backup_drive_chave). Ações:
//   manifesto {semana?}      semana (segunda a domingo, Brasília), tabelas, O.S. atendidas e demais arquivos novos
//   tabela {tabela, pagina}  linhas da tabela (posicoes_gps só da semana, o resto inteiro)
//   os {id}                  dados, fotos (links), relatório em HTML (o script converte em PDF) e KMZ das caixas
//   links {itens}            links temporários dos demais arquivos
// fusao.ts e kmzCaixas.ts são cópias idênticas de apps/painel/src/lib.
import { createClient } from "@supabase/supabase-js";

import { CaixaKmz, montarKmz } from "./kmzCaixas.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BRASILIA = -3 * 3600_000;
const POR_PAGINA = 3000;
const SO_DA_SEMANA: Record<string, string> = { posicoes_gps: "registrado_em" };

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function semana(data?: string) {
  const base = data ? new Date(`${data}T12:00:00-03:00`) : new Date(Date.now() - 7 * 86400_000);
  const local = new Date(base.getTime() + BRASILIA);
  const segunda = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  const inicio = new Date(segunda - BRASILIA);
  const fim = new Date(inicio.getTime() + 7 * 86400_000);
  const quinta = new Date(segunda + 3 * 86400_000);
  const ano = quinta.getUTCFullYear();
  const numero = Math.floor((quinta.getTime() - Date.UTC(ano, 0, 1)) / (7 * 86400_000)) + 1;
  const dm = (t: number) => new Date(t).toISOString().slice(5, 10).split("-").reverse().join("-");
  return { inicio, fim, nome: `${ano}-S${String(numero).padStart(2, "0")} (${dm(segunda)} a ${dm(segunda + 6 * 86400_000)})` };
}

const limpar = (t: string, max = 90) => t.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
const quando = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() + BRASILIA).toISOString().slice(0, 16).replace("T", " ").split(" ").map((p, i) => i ? p : p.split("-").reverse().join("/")).join(" ") : "—";
const arquivoHora = (iso: string | null) => (iso ? quando(iso).replace(/\//g, "-").replace(":", "h") : "");
const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pastaDaOs = (o: { numero: number; tipo: string; titulo: string }) => limpar(`OS-${o.numero} ${o.tipo} - ${o.titulo}`);

const ROTULO_ANEXO: Record<string, string> = {
  foto_antes: "Antes", foto_depois: "Depois", foto_caixa: "Caixa", foto_bandeja: "Bandeja", foto_olt: "OLT",
  foto_otdr: "OTDR", assinatura: "Assinatura", documento: "Apoio",
};
const STATUS: Record<string, string> = {
  rascunho: "Backlog", enviada: "Enviada", aceita: "Visualizada", em_execucao: "Em execução", pausada: "Pausada",
  concluida: "Aguardando baixa", devolvida: "Devolvida", baixada: "Baixada", cancelada: "Cancelada",
};
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function manifesto(data?: string) {
  const { inicio, fim, nome } = semana(data);
  const [{ data: tabelas }, { data: ordens }, { data: arquivos }] = await Promise.all([
    admin.rpc("backup_tabelas"),
    admin.from("ordens_servico").select("id, numero, tipo, titulo, status, concluida_em, ticket_acionamento, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome), rota:rotas(trecho)")
      .gte("concluida_em", inicio.toISOString()).lt("concluida_em", fim.toISOString()).neq("status", "cancelada").order("numero"),
    admin.rpc("backup_arquivos", { p_inicio: inicio.toISOString(), p_fim: fim.toISOString() }),
  ]);
  const lista = (ordens ?? []) as unknown as { id: string; numero: number; tipo: string; titulo: string; status: string; concluida_em: string;
    ticket_acionamento: string | null; tecnico: { nome: string } | null; rota: { trecho: string } | null }[];
  // Arquivos das O.S. atendidas já vão para a pasta de cada uma.
  const ids = new Set(lista.map((o) => o.id));
  const { data: daOs } = ids.size
    ? await admin.from("os_anexos").select("caminho_arquivo").in("os_id", [...ids]) : { data: [] };
  const naPastaDaOs = new Set((daOs ?? []).map((a) => a.caminho_arquivo));
  const resumo = [["O.S.", "Tipo", "Título", "Técnico", "Trecho", "Status", "Concluída em", "Ticket"].map(csv).join(";"),
    ...lista.map((o) => [o.numero, o.tipo, o.titulo, o.tecnico?.nome, o.rota?.trecho, STATUS[o.status] ?? o.status, quando(o.concluida_em), o.ticket_acionamento].map(csv).join(";"))];
  return {
    nome, inicio, fim,
    tabelas: ((tabelas ?? []) as { tabela: string }[]).map((t) => t.tabela),
    ordens: lista.map((o) => ({ id: o.id, numero: o.numero, pasta: pastaDaOs(o) })),
    arquivos: ((arquivos ?? []) as { bucket: string; caminho: string }[])
      .filter((a) => !(a.bucket === "os-anexos" && naPastaDaOs.has(a.caminho)))
      .map((a) => ({ bucket: a.bucket, caminho: a.caminho, destino: ["Arquivos da semana", a.bucket, ...a.caminho.split("/")].map((p) => limpar(p, 120)) })),
    resumoCsv: "﻿" + resumo.join("\r\n"),
  };
}

async function tabela(nome: string, pagina: number, data?: string) {
  const { data: tabelas } = await admin.rpc("backup_tabelas");
  if (!((tabelas ?? []) as { tabela: string }[]).some((t) => t.tabela === nome)) throw new Error("tabela desconhecida");
  let q = admin.from(nome).select("*").range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  const coluna = SO_DA_SEMANA[nome];
  if (coluna) {
    const { inicio, fim } = semana(data);
    q = q.gte(coluna, inicio.toISOString()).lt(coluna, fim.toISOString()).order(coluna);
  }
  const { data: linhas, error } = await q;
  if (error) throw new Error(`${nome}: ${error.message}`);
  return { linhas: linhas ?? [], acabou: (linhas ?? []).length < POR_PAGINA };
}

async function os(id: string) {
  const [o, eventos, servicos, apoio, anexos, caixas] = await Promise.all([
    admin.from("ordens_servico").select("*, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome, cargo), rota:rotas(trecho), veiculo:veiculos(placa, modelo)").eq("id", id).single(),
    admin.from("os_eventos").select("status_novo, criado_em, observacao, usuario:usuarios(nome)").eq("os_id", id).order("criado_em"),
    admin.from("os_servicos_executados").select("quantidade, observacao, item:itens_execucao(nome, unidade, categoria)").eq("os_id", id).order("lancado_em"),
    admin.from("os_tecnicos_apoio").select("tecnico:usuarios!os_tecnicos_apoio_tecnico_id_fkey(nome)").eq("os_id", id),
    admin.from("os_anexos").select("*").eq("os_id", id).order("criado_em"),
    admin.from("caixas_mapa").select("*").eq("os_id", id).order("localizada_em"),
  ]);
  if (o.error || !o.data) throw new Error("O.S. não encontrada");
  const d = o.data as Record<string, any>;
  const listaCaixas = (caixas.data ?? []) as unknown as (CaixaKmz & { endereco: string | null })[];
  const tag = new Map(listaCaixas.map((c) => [c.id, c.identificacao]));

  const lista = (anexos.data ?? []) as Record<string, any>[];
  const { data: links } = lista.length
    ? await admin.storage.from("os-anexos").createSignedUrls(lista.map((a) => a.caminho_arquivo), 6 * 3600) : { data: [] };
  const fotos = lista.map((a, i) => {
    const ext = (a.caminho_arquivo.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg").toLowerCase();
    const partes = [String(i + 1).padStart(2, "0"), ROTULO_ANEXO[a.tipo] ?? a.tipo, a.caixa_id ? tag.get(a.caixa_id) : null,
      a.bandeja ? `bandeja ${a.bandeja}` : null, a.fibra ? `fibra ${a.fibra}` : null, arquivoHora(a.tirada_em ?? a.criado_em)];
    const nome = a.tipo === "documento" && a.nome_arquivo ? `${partes[0]} ${a.nome_arquivo}` : `${partes.filter(Boolean).join(" ")}${ext}`;
    return { nome: limpar(nome, 120), url: links?.[i]?.signedUrl ?? null, imagem: /\.(jpe?g|png)$/.test(ext) && a.tipo !== "documento", legenda: partes.slice(1).filter(Boolean).join(" · ") };
  }).filter((f) => f.url);

  const linha = (rotulo: string, valor: unknown) => (valor ? `<tr><th>${esc(rotulo)}</th><td>${esc(valor)}</td></tr>` : "");
  const servs = (servicos.data ?? []) as Record<string, any>[];
  const html = `<html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;font-size:11px;color:#101828}
h1{font-size:18px;color:#163A6B;margin:0}h2{font-size:13px;color:#163A6B;border-bottom:2px solid #163A6B;padding-bottom:2px;margin-top:16px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d5dd;padding:4px;text-align:left;vertical-align:top}th{background:#f2f4f7;width:28%}
.sub{color:#667085}.foto{display:inline-block;width:48%;margin:0 1% 8px 0;vertical-align:top}.foto img{width:100%}.foto div{font-size:9px;color:#667085}
</style></head><body>
<h1>O.S. #${d.numero} · ${esc(d.tipo)}</h1><div class="sub">${esc(d.titulo)} · ${esc(STATUS[d.status] ?? d.status)} · Multivale Backbone · Técnico Plus</div>
<h2>Dados</h2><table>
${linha(d.ticket_interno ? "Token" : "Ticket", d.ticket_acionamento)}${linha("Técnico", d.tecnico ? `${d.tecnico.nome}${d.tecnico.cargo ? ` (${d.tecnico.cargo})` : ""}` : null)}
${linha("Apoio", ((apoio.data ?? []) as Record<string, any>[]).map((a) => a.tecnico?.nome).filter(Boolean).join(", "))}
${linha("Trecho", d.rota?.trecho)}${linha("Endereço", d.endereco)}${linha("Veículo", d.veiculo ? `${d.veiculo.placa} ${d.veiculo.modelo ?? ""}` : null)}
${linha("Prioridade", d.prioridade)}${linha("Cadastro", quando(d.criado_em))}${linha("Início", d.iniciada_em && quando(d.iniciada_em))}
${linha("Conclusão", d.concluida_em && quando(d.concluida_em))}${linha("Baixa", d.baixada_em && quando(d.baixada_em))}
${linha("Descrição", d.descricao)}${linha("Observação do técnico", d.observacao_tecnico)}${linha("Observação do supervisor", d.observacao_supervisor)}
</table>
${servs.length ? `<h2>Serviços e materiais</h2><table>${servs.map((s) => `<tr><td>${esc(s.item?.categoria === "material" ? "Material" : "Serviço")}</td><td>${esc(s.item?.nome)}${s.observacao ? ` · ${esc(s.observacao)}` : ""}</td><td>${esc(s.quantidade)} ${esc(s.item?.unidade)}</td></tr>`).join("")}</table>` : ""}
${listaCaixas.length ? `<h2>Caixas de emenda (${listaCaixas.length})</h2><table>${listaCaixas.map((c) => `<tr><td>${esc(c.identificacao)}</td><td>${esc(c.tipo)} · entrada ${esc(c.capacidade_fibras)} FO · ${esc(c.grupos_fusionados)} grupos fusionados</td><td>${esc(c.endereco ?? "")}</td></tr>`).join("")}</table>` : ""}
<h2>Histórico</h2><table>${((eventos.data ?? []) as Record<string, any>[]).map((e) => `<tr><td>${quando(e.criado_em)}</td><td>${esc(STATUS[e.status_novo] ?? e.status_novo)}${e.observacao ? ` · ${esc(e.observacao)}` : ""}</td><td>${esc(e.usuario?.nome ?? "")}</td></tr>`).join("")}</table>
<h2>Fotos (${fotos.filter((f) => f.imagem).length})</h2>{{FOTOS}}
</body></html>`;

  const kmz = listaCaixas.some((c) => c.latitude != null)
    ? btoa(Array.from(await montarKmz(admin, listaCaixas, listaCaixas), (b) => String.fromCharCode(b)).join("")) : null;
  return { pasta: pastaDaOs(d as { numero: number; tipo: string; titulo: string }), numero: d.numero, dados: { os: d, eventos: eventos.data, servicos: servicos.data, apoio: apoio.data, anexos: anexos.data, caixas: caixas.data }, html, kmz, fotos };
}

async function links(itens: { bucket: string; caminho: string }[]) {
  return Promise.all(itens.slice(0, 50).map(async (a) => {
    const { data } = await admin.storage.from(a.bucket).createSignedUrl(a.caminho, 6 * 3600);
    return data?.signedUrl ?? null;
  }));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  const corpo = await req.json().catch(() => ({}));
  const { data: chave } = await admin.rpc("interno_segredo_backup");
  if (!chave || corpo.chave !== chave) return responder({ erro: "chave inválida" }, 401);
  try {
    switch (corpo.acao) {
      case "manifesto": return responder(await manifesto(corpo.semana));
      case "tabela": return responder(await tabela(String(corpo.tabela), Number(corpo.pagina) || 0, corpo.semana));
      case "os": return responder(await os(String(corpo.id)));
      case "links": return responder(await links(corpo.itens ?? []));
      default: return responder({ erro: "ação desconhecida" }, 400);
    }
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500);
  }
});
