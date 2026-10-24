"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Posicao = {
  tecnico_id: string;
  nome: string;
  registrado_em: string;
  latitude: number;
  longitude: number;
  velocidade_kmh: number | null;
  bateria_pct: number | null;
};

export default function TecnicosAoVivo() {
  const [posicoes, setPosicoes] = useState<Posicao[]>([]);
  const [agora, setAgora] = useState(0);

  const carregar = useCallback(() => {
    supabase.from("posicao_atual_tecnicos").select("*").order("nome").then(({ data }) => {
      setPosicoes(data ?? []);
      setAgora(Date.now());
    });
  }, []);

  useEffect(() => {
    carregar();
    // Atualiza o "há X min" mesmo sem posição nova.
    const relogio = setInterval(carregar, 60_000);
    const canal = supabase
      .channel("painel-gps")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posicoes_gps" }, carregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "expedientes" }, carregar)
      .subscribe();
    return () => {
      clearInterval(relogio);
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Técnicos em expediente ({posicoes.length})</h2>
      {posicoes.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-500">Nenhum técnico com expediente aberto.</p>
      ) : (
        <ul>
          {posicoes.map((p) => {
            const minutos = Math.round((agora - new Date(p.registrado_em).getTime()) / 60000);
            return (
              <li key={p.tecnico_id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 text-sm last:border-0">
                <span className="font-medium">{p.nome}</span>
                <span className={minutos > 15 ? "text-red-700" : "text-gray-500"}>
                  última posição há {minutos} min
                </span>
                {p.bateria_pct != null && <span className="text-gray-500">bateria {p.bateria_pct}%</span>}
                <a className="ml-auto text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}>
                  Ver no mapa
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
