import { comprimento, lerKmz, simplificar } from "@/lib/tracado";

// Rede do backbone para o mapa do console: cada linha do KMZ geral, simplificada (~15 m) para ficar leve.
export type LinhaRede = { nome: string; m: number; c: [number, number][] };

export async function linhasDoKmz(arquivo: File): Promise<LinhaRede[]> {
  const t = await lerKmz(new Uint8Array(await arquivo.arrayBuffer()));
  return t.linhas
    .map((l, i) => ({
      nome: t.nomesLinhas?.[i] ?? `Linha ${i + 1}`,
      m: Math.round(comprimento(l)),
      c: simplificar(l, 15).map((p) => [+p.lng.toFixed(5), +p.lat.toFixed(5)] as [number, number]),
    }))
    .filter((l) => l.c.length >= 2);
}
