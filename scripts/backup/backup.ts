// Backup semanal do Técnico Plus (roda no GitHub Actions, ver .github/workflows/backup-semanal.yml).
// Monta em SAIDA a pasta da semana (segunda a domingo, horário de Brasília):
//   banco/<tabela>.json       todas as tabelas (o workflow compacta em banco-completo.zip)
//   O.S. atendidas/OS-<n> ...  uma subpasta por O.S. concluída na semana: dados.json, fotos, relatório PDF e KMZ das caixas
//   Arquivos da semana/...     demais arquivos enviados na semana (despesas, inventário, curvas, documentos)
//   resumo.csv                 lista das O.S. da semana
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAINEL_URL, SAIDA, SEMANA (qualquer data da semana, AAAA-MM-DD;
// sem ela, a semana anterior à de hoje).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import type { CaixaPainel } from "../../apps/painel/src/componentes/CaixaDetalhe";
import { montarKmz } from "../../apps/painel/src/lib/kmzCaixas";

const URL_SUPABASE = process.env.SUPABASE_URL || "https://wnuivnpywflczknxpytx.supabase.co";
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAINEL = (process.env.PAINEL_URL || "https://tecnico-plus-backbone.vercel.app").replace(/\/$/, "");
const SAIDA = process.env.SAIDA || "backup-saida";
if (!CHAVE) throw new Error("Falta o segredo SUPABASE_SERVICE_ROLE_KEY");

const db = createClient(URL_SUPABASE, CHAVE, { auth: { persistSession: false } });
const BRASILIA = -3 * 3600_000; // sem horário de verão desde 2019

// Segunda 00:00 a segunda 00:00 (Brasília) da semana pedida ou da anterior.
function semana() {
  const base = process.env.SEMANA ? new Date(`${process.env.SEMANA}T12:00:00-03:00`) : new Date(Date.now() - 7 * 86400_000);
  const local = new Date(base.getTime() + BRASILIA);
  const diasDesdeSegunda = (local.getUTCDay() + 6) % 7;
  const segunda = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diasDesdeSegunda);
  const inicio = new Date(segunda - BRASILIA);
  const fim = new Date(inicio.getTime() + 7 * 86400_000);
  // Número da semana ISO (a quinta-feira define o ano).
  const quinta = new Date(segunda + 3 * 86400_000);
  const ano = quinta.getUTCFullYear();
  const numero = Math.floor((quinta.getTime() - Date.UTC(ano, 0, 1)) / (7 * 86400_000)) + 1;
  const dm = (t: number) => new Date(t).toISOString().slice(5, 10).split("-").reverse().join("-");
  const nome = `${ano}-S${String(numero).padStart(2, "0")} (${dm(segunda)} a ${dm(segunda + 6 * 86400_000)})`;
  return { inicio, fim, nome };
}

const limpar = (t: string, max = 90) =>
  t.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
const horaLocal = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + BRASILIA).toISOString().slice(0, 16).replace("T", " ").replace(":", "h") : "";
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function todas<T>(tabela: string, filtro?: (q: ReturnType<ReturnType<typeof db.from>["select"]>) => unknown): Promise<T[]> {
  const linhas: T[] = [];
  for (let i = 0; ; i += 1000) {
    let q = db.from(tabela).select("*").range(i, i + 999);
    if (filtro) q = filtro(q) as typeof q;
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return linhas;
  }
}

async function baixar(bucket: string, caminho: string, destino: string) {
  const { data, error } = await db.storage.from(bucket).download(caminho);
  if (error || !data) {
    console.warn(`  ! não baixou ${bucket}/${caminho}: ${error?.message}`);
    return false;
  }
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(await data.arrayBuffer()));
  return true;
}

const ROTULO_ANEXO: Record<string, string> = {
  foto_antes: "Antes", foto_depois: "Depois", foto_caixa: "Caixa", foto_bandeja: "Bandeja", foto_olt: "OLT",
  foto_otdr: "OTDR", assinatura: "Assinatura", documento: "Apoio",
};

// Relatório em PDF: o mesmo link de parceiro do painel, aberto num navegador sem tela e impresso.
async function relatorioPdf(navegador: import("playwright").Browser, osId: string, autor: string, destino: string) {
  const { data, error } = await db.from("os_relatorios_compartilhados")
    .insert({ os_id: osId, criado_por: autor, expira_em: new Date(Date.now() + 3600_000).toISOString() })
    .select("token").single();
  if (error || !data) return console.warn(`  ! relatório: ${error?.message}`);
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(`${PAINEL}/relatorio?t=${data.token}`, { waitUntil: "networkidle", timeout: 90_000 });
    await pagina.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 60_000 }).catch(() => {});
    await pagina.pdf({ path: destino, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
  } catch (e) {
    console.warn(`  ! relatório: ${(e as Error).message}`);
  } finally {
    await pagina.close();
    await db.from("os_relatorios_compartilhados").update({ revogado: true }).eq("token", data.token);
  }
}

async function main() {
  const { inicio, fim, nome } = semana();
  const raiz = path.join(SAIDA, nome);
  console.log(`Semana ${nome}: ${inicio.toISOString()} a ${fim.toISOString()}`);
  await mkdir(raiz, { recursive: true });
  await writeFile(path.join(SAIDA, "nome-da-semana.txt"), nome);

  // 1. Banco completo, tabela por tabela.
  const { data: tabelas, error } = await db.rpc("backup_tabelas");
  if (error) throw new Error(`backup_tabelas: ${error.message}`);
  for (const { tabela } of tabelas as { tabela: string }[]) {
    const linhas = await todas(tabela);
    await mkdir(path.join(raiz, "banco"), { recursive: true });
    await writeFile(path.join(raiz, "banco", `${tabela}.json`), JSON.stringify(linhas));
    console.log(`banco: ${tabela} (${linhas.length})`);
  }

  // 2. O.S. atendidas (concluídas) na semana.
  const { data: ordens } = await db.from("ordens_servico")
    .select("*, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome), rota:rotas(trecho)")
    .gte("concluida_em", inicio.toISOString()).lt("concluida_em", fim.toISOString()).order("numero");
  const { data: sup } = await db.from("usuarios").select("id").in("papel", ["supervisor", "admin"]).eq("ativo", true).limit(1).single();
  const rede = await todas<CaixaPainel>("caixas_mapa");
  const jaNaPastaDaOs = new Set<string>();
  const resumo = [["O.S.", "Tipo", "Título", "Técnico", "Trecho", "Status", "Concluída em", "Ticket", "Fotos", "Caixas"].map(csv).join(";")];

  const { chromium } = await import("playwright");
  const navegador = await chromium.launch();
  try {
    for (const os of ordens ?? []) {
      const pasta = path.join(raiz, "O.S. atendidas", limpar(`OS-${os.numero} ${os.tipo} - ${os.titulo}`));
      console.log(pasta);
      await mkdir(pasta, { recursive: true });
      const [eventos, servicos, apoio, anexos] = await Promise.all([
        db.from("os_eventos").select("*").eq("os_id", os.id).order("criado_em"),
        db.from("os_servicos_executados").select("*, item:itens_execucao(nome, unidade, categoria)").eq("os_id", os.id),
        db.from("os_tecnicos_apoio").select("*, tecnico:usuarios!os_tecnicos_apoio_tecnico_id_fkey(nome)").eq("os_id", os.id),
        db.from("os_anexos").select("*").eq("os_id", os.id).order("criado_em"),
      ]);
      const caixas = rede.filter((c) => c.os_id === os.id);
      await writeFile(path.join(pasta, "dados.json"), JSON.stringify({
        os, eventos: eventos.data, servicos: servicos.data, apoio: apoio.data, anexos: anexos.data, caixas,
      }, null, 2));

      const tag = new Map(caixas.map((c) => [c.id, c.identificacao]));
      let n = 0;
      for (const a of anexos.data ?? []) {
        const ext = path.extname(a.caminho_arquivo) || ".jpg";
        const partes = [String(++n).padStart(2, "0"), ROTULO_ANEXO[a.tipo] ?? a.tipo, a.caixa_id ? tag.get(a.caixa_id) : null,
          a.bandeja ? `bandeja ${a.bandeja}` : null, a.fibra ? `fibra ${a.fibra}` : null, horaLocal(a.tirada_em ?? a.criado_em)];
        const nomeArquivo = a.tipo === "documento" && a.nome_arquivo ? `${partes[0]} ${a.nome_arquivo}` : `${partes.filter(Boolean).join(" ")}${ext}`;
        if (await baixar("os-anexos", a.caminho_arquivo, path.join(pasta, "fotos", limpar(nomeArquivo, 120)))) jaNaPastaDaOs.add(`os-anexos/${a.caminho_arquivo}`);
      }

      if (sup) await relatorioPdf(navegador, os.id, sup.id, path.join(pasta, `Relatorio OS-${os.numero}.pdf`));
      if (caixas.length) await writeFile(path.join(pasta, `Caixas OS-${os.numero}.kmz`), await montarKmz(db, caixas, rede));

      resumo.push([os.numero, os.tipo, os.titulo, os.tecnico?.nome, os.rota?.trecho, os.status, horaLocal(os.concluida_em),
        os.ticket_acionamento, n, caixas.length].map(csv).join(";"));
    }
  } finally {
    await navegador.close();
  }
  await writeFile(path.join(raiz, "resumo.csv"), "﻿" + resumo.join("\r\n"));

  // 3. Demais arquivos enviados na semana (fotos de O.S. de outras semanas, despesas, inventário, curvas, documentos).
  const { data: arquivos } = await db.rpc("backup_arquivos", { p_inicio: inicio.toISOString(), p_fim: fim.toISOString() });
  for (const a of (arquivos ?? []) as { bucket: string; caminho: string }[]) {
    if (jaNaPastaDaOs.has(`${a.bucket}/${a.caminho}`)) continue;
    await baixar(a.bucket, a.caminho, path.join(raiz, "Arquivos da semana", a.bucket, ...a.caminho.split("/")));
  }
  console.log(`Pronto: ${ordens?.length ?? 0} O.S., ${(arquivos ?? []).length} arquivos novos na semana.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
