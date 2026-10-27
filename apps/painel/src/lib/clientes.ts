import { supabase } from "@/lib/supabase";

export type Cliente = { id: string; nome: string; sla_horas: number; ativo: boolean };
export type ClienteOS = {
  id?: string; cliente_id: string; ticket: string; texto_acionamento: string;
  // Baixa parcial: OK do cliente (sinal restabelecido e NOC confirmou).
  restabelecido_em?: string | null; noc_confirmado_em?: string | null; noc_contato?: string | null;
};

export const listarClientes = async () =>
  ((await supabase.from("clientes").select("id, nome, sla_horas, ativo").order("nome")).data as Cliente[]) ?? [];

export const clientesDaOS = async (osId: string) =>
  ((await supabase.from("os_clientes").select("id, cliente_id, ticket, texto_acionamento, restabelecido_em, noc_confirmado_em, noc_contato").eq("os_id", osId).order("criado_em")).data ?? [])
    .map((c) => ({ ...c, ticket: c.ticket ?? "", texto_acionamento: c.texto_acionamento ?? "" })) as ClienteOS[];

// Grava os clientes da O.S. (substitui os anteriores) e recalcula o SLA pelo menor SLA entre eles.
export async function salvarClientesOS(osId: string, linhas: ClienteOS[]) {
  const validas = linhas.filter((l) => l.cliente_id);
  const { error: e1 } = await supabase.from("os_clientes").delete().eq("os_id", osId);
  if (e1) throw e1;
  if (validas.length) {
    const { error: e2 } = await supabase.from("os_clientes").insert(validas.map((l) => ({
      os_id: osId, cliente_id: l.cliente_id, ticket: l.ticket.trim() || null, texto_acionamento: l.texto_acionamento.trim() || null,
      // Mantém o OK já dado (a gravação substitui as linhas).
      restabelecido_em: l.restabelecido_em ?? null, noc_confirmado_em: l.noc_confirmado_em ?? null, noc_contato: l.noc_contato ?? null,
    })));
    if (e2) throw e2;
  }
  const { error: e3 } = await supabase.rpc("recalcular_sla_os", { p_os: osId });
  if (e3) throw e3;
}

export const fmtSla = (h: number) => (Number.isInteger(Number(h)) ? `${h}h` : `${String(h).replace(".", ",")}h`);

// OK do cliente (baixa parcial): grava ou desfaz (null) o restabelecimento e a confirmação do NOC.
export async function darOkCliente(id: string, ok: { restabelecido_em: string; noc_confirmado_em: string | null; noc_contato: string | null } | null) {
  const { error } = await supabase.from("os_clientes")
    .update(ok ?? { restabelecido_em: null, noc_confirmado_em: null, noc_contato: null }).eq("id", id);
  if (error) throw error;
}
