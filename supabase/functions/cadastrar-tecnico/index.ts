// Cadastro de técnico ou auxiliar pelo painel: só um supervisor logado pode chamar.
// Cria o login (e-mail + senha inicial) com a chave de serviço e grava nome e cargo
// com o próprio login do supervisor, para passar pelas regras de acesso normais.
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

  const url = Deno.env.get("SUPABASE_URL")!;
  const chaveAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const comoSupervisor = createClient(url, chaveAnon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: ehSupervisor, error: erroPapel } = await comoSupervisor.rpc("eh_supervisor");
  if (erroPapel || !ehSupervisor) return responder({ erro: "Somente supervisores podem cadastrar técnicos." }, 403);

  const corpo = await req.json();
  const { nome, cargo, matricula } = corpo;
  const papel = corpo.papel === "auxiliar" ? "auxiliar" : "tecnico";
  const tecnicoResponsavel = papel === "auxiliar" ? corpo.tecnico_responsavel_id || null : null;
  // Auxiliar pode ficar sem acesso ao app: cria um login interno que ninguém usa.
  const semLogin = papel === "auxiliar" && !corpo.email;
  const email = semLogin ? `auxiliar-${crypto.randomUUID()}@tecnicoplus.invalid` : corpo.email;
  const senha = semLogin ? crypto.randomUUID() + crypto.randomUUID() : corpo.senha;
  if (!nome) return responder({ erro: "Informe o nome." }, 400);
  if (!email || !senha) return responder({ erro: "Informe e-mail e senha." }, 400);
  if (String(senha).length < 8) return responder({ erro: "A senha inicial precisa de pelo menos 8 caracteres." }, 400);

  const admin = createClient(url, chaveServico, { auth: { persistSession: false } });
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password: String(senha),
    email_confirm: true,
    user_metadata: { nome },
  });
  if (erroCriar) return responder({ erro: erroCriar.message }, 400);

  // O perfil é criado pelo gatilho do banco; aqui o supervisor completa os dados.
  const { error: erroPerfil } = await comoSupervisor
    .from("usuarios")
    .update({
      nome, cargo: cargo || (papel === "auxiliar" ? "Auxiliar técnico" : "Técnico"), matricula: matricula || null, papel,
      tecnico_responsavel_id: tecnicoResponsavel,
    })
    .eq("id", criado.user.id);
  if (erroPerfil) return responder({ erro: erroPerfil.message, id: criado.user.id }, 500);

  return responder({ id: criado.user.id });
});
