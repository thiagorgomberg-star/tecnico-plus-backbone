// E-mail de login de um técnico, auxiliar ou supervisor: só um supervisor logado pode ver e trocar.
// A troca usa a chave de serviço e já confirma o e-mail novo (o técnico entra com ele e a mesma senha).
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
  const comoSupervisor = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: ehSupervisor, error: erroPapel } = await comoSupervisor.rpc("eh_supervisor");
  if (erroPapel || !ehSupervisor) return responder({ erro: "Somente supervisores podem ver ou trocar o e-mail de login." }, 403);

  const { id, email } = await req.json();
  if (!id) return responder({ erro: "Informe o usuário." }, 400);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (!email) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) return responder({ erro: error.message }, 400);
    const atual = data.user.email ?? "";
    // Auxiliar sem acesso ao app tem um login interno que ninguém usa.
    return responder({ email: atual.endsWith("@tecnicoplus.invalid") ? "" : atual });
  }

  const novo = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo)) return responder({ erro: "E-mail inválido." }, 400);
  const { error } = await admin.auth.admin.updateUserById(id, { email: novo, email_confirm: true });
  if (error) return responder({ erro: /already|registered|exists/i.test(error.message) ? "Este e-mail já está em uso por outro login." : error.message }, 400);
  return responder({ email: novo });
});
