// Dados do relatório do evento para o link compartilhado com parceiros (sem login).
// Só responde com um token válido, não revogado e dentro da validade.
import { createClient } from "npm:@supabase/supabase-js@2";

const cabecalhos = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });

  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return responder({ erro: "Link inválido." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: link } = await admin.from("os_relatorios_compartilhados")
    .select("os_id, expira_em, revogado").eq("token", token).maybeSingle();
  if (!link || link.revogado || new Date(link.expira_em) < new Date()) {
    return responder({ erro: "Este link expirou ou foi cancelado." }, 404);
  }
  const osId = link.os_id;

  const [os, eventos, servicos, apoio, anexos, local] = await Promise.all([
    admin.from("ordens_servico")
      .select("numero, tipo, titulo, descricao, endereco, status, prioridade, ticket_acionamento, ticket_interno, criado_em, enviada_em, iniciada_em, concluida_em, baixada_em, observacao_tecnico, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome, cargo), rota:rotas(trecho)")
      .eq("id", osId).single(),
    admin.from("os_eventos").select("status_novo, criado_em").eq("os_id", osId).order("criado_em"),
    admin.from("os_servicos_executados").select("quantidade, observacao, item:itens_execucao(nome, unidade, categoria)").eq("os_id", osId).order("lancado_em"),
    admin.from("os_tecnicos_apoio").select("tecnico:usuarios!os_tecnicos_apoio_tecnico_id_fkey(nome)").eq("os_id", osId),
    admin.from("os_anexos").select("tipo, caminho_arquivo, tirada_em").eq("os_id", osId).in("tipo", ["foto_antes", "foto_depois"]).order("criado_em"),
    admin.from("eventos_mapa").select("latitude, longitude, evento_localizado_em, evento_precisao_m").eq("id", osId).maybeSingle(),
  ]);
  if (os.error || !os.data) return responder({ erro: "O.S. não encontrada." }, 404);

  const caminhos = (anexos.data ?? []).map((a) => a.caminho_arquivo);
  const { data: urls } = caminhos.length
    ? await admin.storage.from("os-anexos").createSignedUrls(caminhos, 24 * 3600)
    : { data: [] };

  return responder({
    os: os.data,
    eventos: eventos.data ?? [],
    servicos: servicos.data ?? [],
    apoio: (apoio.data ?? []).map((a) => (a.tecnico as { nome?: string } | null)?.nome).filter(Boolean),
    fotos: (anexos.data ?? []).map((a, i) => ({ tirada_em: a.tirada_em, url: urls?.[i]?.signedUrl ?? null })),
    local: local.data,
    gerado_em: new Date().toISOString(),
  });
});
