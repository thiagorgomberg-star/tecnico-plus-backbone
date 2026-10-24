import { createClient } from "@supabase/supabase-js";

// Endereço e chave pública do projeto (a chave publishable foi feita para ficar no site;
// quem protege os dados são as regras do banco). As variáveis de ambiente, se existirem, têm prioridade.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wnuivnpywflczknxpytx.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dRn1z_bQvs2zqEK_EBSCmQ_trb_hjpG",
);

// Formato que o PostGIS aceita para um ponto (longitude primeiro).
export function ponto(latitude: number, longitude: number) {
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}
