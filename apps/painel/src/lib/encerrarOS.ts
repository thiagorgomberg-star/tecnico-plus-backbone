import { supabase } from "@/lib/supabase";

// Supervisor encerra pelo próprio login a O.S. que está com o técnico (ex.: técnico sem sinal ou que esqueceu de concluir).
// Fica "aguardando baixa" com o motivo registrado; se o supervisor quiser, já dá a baixa na sequência.
export async function encerrarPeloSupervisor(os: { id: string; numero: number | null; iniciada_em?: string | null }): Promise<boolean> {
  const motivo = window.prompt(`Encerrar a O.S. #${os.numero ?? ""} pelo supervisor?\nO técnico não precisa fazer nada no app.\n\nMotivo / observação (obrigatório):`)?.trim();
  if (!motivo) return false;
  const agora = new Date().toISOString();
  const { error } = await supabase.from("ordens_servico").update({
    status: "concluida",
    concluida_em: agora,
    iniciada_em: os.iniciada_em ?? agora,
    continua_em: null,
    observacao_supervisor: `Encerrada pelo supervisor: ${motivo}`,
  }).eq("id", os.id);
  if (error) {
    alert(error.message);
    return false;
  }
  if (window.confirm("O.S. concluída. Dar baixa agora também?")) {
    const { error: e2 } = await supabase.from("ordens_servico").update({ status: "baixada" }).eq("id", os.id);
    if (e2) alert(e2.message);
  }
  return true;
}
