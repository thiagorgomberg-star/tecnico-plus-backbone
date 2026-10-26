// Exclusão pelo painel (o painel pede dupla confirmação antes): só um supervisor logado pode chamar.
// acao "resumo" mostra o que vai junto; acao "excluir" apaga.
// O.S.: vai junto com fotos, eventos e caixas cadastradas nela.
// Técnico: sem histórico, é apagado de vez (login, expedientes, trajeto, escala).
// Com histórico (O.S., caixas, fotos...), só perde o acesso e some das listas; o histórico fica.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const cabecalhos = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

async function contar(admin: SupabaseClient, tabela: string, filtro: string) {
  const { count } = await admin.from(tabela).select("*", { count: "exact", head: true }).or(filtro);
  return count ?? 0;
}

// Registros que impedem apagar o técnico de vez.
async function vinculosTecnico(admin: SupabaseClient, id: string) {
  const v: Record<string, number> = {
    "O.S.": await contar(admin, "ordens_servico", `tecnico_id.eq.${id},criada_por.eq.${id}`)
      + await contar(admin, "os_eventos", `usuario_id.eq.${id}`),
    fotos: await contar(admin, "os_anexos", `enviado_por.eq.${id}`),
    caixas: await contar(admin, "caixas_emenda", `criada_por.eq.${id}`),
    "fibras/manobras": await contar(admin, "caixa_fibras", `atualizado_por.eq.${id}`)
      + await contar(admin, "caixa_manobras", `criada_por.eq.${id}`),
    "serviços lançados": await contar(admin, "os_servicos_executados", `lancado_por.eq.${id}`)
      + await contar(admin, "os_tecnicos_apoio", `tecnico_id.eq.${id},adicionado_por.eq.${id}`),
    despesas: await contar(admin, "despesas", `tecnico_id.eq.${id},conferida_por.eq.${id},reembolso_pago_por.eq.${id}`),
    ferramental: await contar(admin, "ferramentas", `tecnico_id.eq.${id},criado_por.eq.${id}`)
      + await contar(admin, "inventario_inspecoes", `tecnico_id.eq.${id}`),
    estoque: await contar(admin, "estoque_movimentos", `tecnico_id.eq.${id},criado_por.eq.${id}`),
    curvas: await contar(admin, "rota_curvas", `enviado_por.eq.${id}`),
    "relatórios": await contar(admin, "os_relatorios_compartilhados", `criado_por.eq.${id}`),
    "escala lançada": await contar(admin, "escala", `and(criado_por.eq.${id},tecnico_id.neq.${id})`),
  };
  return Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });

  const url = Deno.env.get("SUPABASE_URL")!;
  const comoSupervisor = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: ehSupervisor, error: erroPapel } = await comoSupervisor.rpc("eh_supervisor");
  if (erroPapel || !ehSupervisor) return responder({ erro: "Somente supervisores podem excluir." }, 403);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { acao, tipo, id } = await req.json();
  if (!/^[0-9a-f-]{36}$/i.test(String(id)) || !["os", "tecnico"].includes(tipo) || !["resumo", "excluir"].includes(acao)) {
    return responder({ erro: "Pedido inválido." }, 400);
  }

  if (tipo === "os") {
    if (acao === "resumo") {
      return responder({
        fotos: await contar(admin, "os_anexos", `os_id.eq.${id}`),
        caixas: await contar(admin, "caixas_emenda", `os_id.eq.${id}`),
      });
    }
    const { data: anexos } = await admin.from("os_anexos").select("caminho_arquivo").eq("os_id", id);
    const { data: apoio } = await admin.storage.from("os-anexos").list(`${id}/apoio`);
    const arquivos = [
      ...(anexos ?? []).map((a) => a.caminho_arquivo).filter(Boolean),
      ...(apoio ?? []).map((a) => `${id}/apoio/${a.name}`),
    ];
    await admin.from("refeicoes").update({ os_pausada_id: null }).eq("os_pausada_id", id);
    const { error } = await admin.from("ordens_servico").delete().eq("id", id);
    if (error) return responder({ erro: error.message }, 400);
    for (let i = 0; i < arquivos.length; i += 100) await admin.storage.from("os-anexos").remove(arquivos.slice(i, i + 100));
    return responder({ resultado: "excluida" });
  }

  const { data: usuario } = await admin.from("usuarios").select("papel").eq("id", id).maybeSingle();
  if (!usuario) return responder({ erro: "Pessoa não encontrada." }, 404);
  if (usuario.papel === "admin") return responder({ erro: "Não é possível excluir o administrador." }, 400);
  // Supervisor não exclui a si mesmo (sobraria o painel sem ninguém para administrar).
  const { data: eu } = await comoSupervisor.auth.getUser();
  if (eu.user?.id === id) return responder({ erro: "Você não pode excluir o seu próprio acesso." }, 400);
  const vinculos = await vinculosTecnico(admin, id);
  const temHistorico = Object.keys(vinculos).length > 0;
  if (acao === "resumo") return responder({ vinculos, temHistorico });

  if (!temHistorico) {
    // Trajeto e refeições saem junto com os expedientes; escala, alertas e celular saem junto com o login.
    await admin.from("posicoes_gps").delete().eq("tecnico_id", id);
    await admin.from("refeicoes").delete().eq("tecnico_id", id);
    const { error: erroExp } = await admin.from("expedientes").delete().eq("tecnico_id", id);
    if (erroExp) return responder({ erro: erroExp.message }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return responder({ erro: error.message }, 400);
    return responder({ resultado: "excluido" });
  }

  // Com histórico: bloqueia o login, libera o e-mail para outro cadastro e tira das listas.
  const { error: erroLogin } = await admin.auth.admin.updateUserById(id, {
    email: `excluido-${id}@tecnicoplus.invalid`,
    ban_duration: "876000h",
  });
  if (erroLogin) return responder({ erro: erroLogin.message }, 400);
  await admin.from("dispositivos_push").delete().eq("usuario_id", id);
  const { error } = await admin.from("usuarios")
    .update({ ativo: false, excluido_em: new Date().toISOString(), push_token: null }).eq("id", id);
  if (error) return responder({ erro: error.message }, 400);
  return responder({ resultado: "acesso_removido", vinculos });
});
