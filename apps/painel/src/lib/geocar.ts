import { supabase } from "@/lib/supabase";

// Pede a posição dos carros à GEOCAR na hora: o 1º pedido sai já, a resposta chega em ~2 s
// e o 2º chamado grava essa resposta (o banco faz o mesmo sozinho a cada 2 min).
export async function atualizarGeocarAgora() {
  await supabase.rpc("geocar_atualizar_agora");
  await new Promise((r) => setTimeout(r, 4000));
  await supabase.rpc("geocar_atualizar_agora");
}
