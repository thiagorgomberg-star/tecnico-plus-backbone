// Envia o alerta como notificação pelo Firebase (toca mesmo com o app fechado).
// Chamada pelo gatilho do banco a cada alerta novo, só com o id: a função marca o alerta como avisado
// de forma atômica (não toca duas vezes) e, se não conseguir enviar, devolve para pendente,
// para o próprio app avisar quando abrir. A conta de serviço do Firebase fica no Vault (fcm_conta_servico)
// ou no segredo FCM_CONTA_SERVICO da função.
import { createClient } from "npm:@supabase/supabase-js@2";

const titulos: Record<string, string> = {
  nova_os: "Nova O.S. recebida",
  prazo_proximo: "SLA perto de vencer",
  os_atrasada: "SLA vencido",
  encerrar_jornada: "Lembrete de jornada",
  os_visualizada: "O.S. visualizada",
  pausa_solicitada: "Pedido de pausa",
  backlog_proximo: "Ocorrência perto de você",
  os_reaberta: "O.S. reaberta",
  apoio_os: "Você é apoio numa O.S.",
};

type Conta = { client_email: string; private_key: string; project_id: string };

const b64url = (dados: ArrayBuffer | string) => {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let tokenCache: { valor: string; expira: number } | null = null;

// Token de acesso do Google (OAuth com JWT assinado pela chave da conta de serviço).
async function tokenGoogle(conta: Conta) {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({
    iss: conta.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600,
  }));
  const pem = conta.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${cabecalho}.${corpo}`));
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${b64url(assinatura)}`,
    }),
  });
  const json = await resposta.json();
  if (!json.access_token) throw new Error(`Google OAuth: ${JSON.stringify(json)}`);
  tokenCache = { valor: json.access_token, expira: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.valor;
}

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({ id: null }));
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return new Response("id inválido", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const segredo = Deno.env.get("FCM_CONTA_SERVICO") ?? (await admin.rpc("interno_segredo_fcm")).data;
  if (!segredo) return new Response("sem conta de serviço", { status: 200 });

  const { data: alerta } = await admin.from("alertas")
    .update({ enviado_push_em: new Date().toISOString() })
    .eq("id", id).is("enviado_push_em", null)
    .select("id, tipo, mensagem, os_id, usuario_id").maybeSingle();
  if (!alerta) return new Response("já avisado", { status: 200 });

  const devolver = () => admin.from("alertas").update({ enviado_push_em: null }).eq("id", alerta.id);
  const { data: dispositivos } = await admin.from("dispositivos_push").select("token").eq("usuario_id", alerta.usuario_id);
  if (!dispositivos?.length) {
    await devolver();
    return new Response("sem dispositivo", { status: 200 });
  }

  // Nova O.S., reaberta, ocorrência perto e apoio tocam o alarme próprio do app (canal criado pelo APK 14 em diante).
  const alarme = ["nova_os", "os_reaberta", "backlog_proximo", "apoio_os"].includes(alerta.tipo);
  let enviados = 0;
  try {
    const conta = JSON.parse(segredo) as Conta;
    const acesso = await tokenGoogle(conta);
    for (const { token } of dispositivos) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: titulos[alerta.tipo] ?? "Técnico Plus", body: alerta.mensagem },
            data: { osId: alerta.os_id ?? "", alertaId: alerta.id },
            android: { priority: "HIGH", notification: alarme ? { channel_id: "alarme-os", sound: "alarme_os" } : { channel_id: "alertas-os", sound: "default", default_vibrate_timings: true } },
          },
        }),
      });
      if (r.ok) enviados++;
      else if (r.status === 404 || r.status === 400) {
        const erro = await r.text();
        if (erro.includes("UNREGISTERED") || erro.includes("registration-token-not-registered")) {
          await admin.from("dispositivos_push").delete().eq("token", token);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  if (!enviados) await devolver();
  return new Response(JSON.stringify({ enviados }), { status: 200, headers: { "Content-Type": "application/json" } });
});
