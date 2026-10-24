import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Formato que o PostGIS aceita para um ponto (longitude primeiro).
export function ponto(latitude: number, longitude: number) {
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}
