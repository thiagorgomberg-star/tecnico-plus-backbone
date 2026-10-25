"use client";

import Icone from "@/componentes/Icone";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Alerta = { id: string; tipo: string; mensagem: string; criado_em: string; lido_em: string | null };

// Sino de avisos do supervisor (O.S. visualizada, SLA vencido...) com notificação do navegador.
export default function Avisos({ usuarioId }: { usuarioId: string }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("alertas").select("id, tipo, mensagem, criado_em, lido_em")
      .eq("usuario_id", usuarioId)
      .gte("criado_em", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
      .order("criado_em", { ascending: false }).limit(50)
      .then(({ data }) => setAlertas(data ?? []));
  }, [usuarioId, versao]);

  useEffect(() => {
    const canal = supabase
      .channel("avisos-supervisor")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alertas", filter: `usuario_id=eq.${usuarioId}` }, (evento) => {
        const novo = evento.new as Alerta;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Técnico Plus", { body: novo.mensagem });
        }
        recarregar();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuarioId, recarregar]);

  const naoLidos = alertas.filter((a) => !a.lido_em);

  async function abrir() {
    setAberto(!aberto);
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  }

  async function marcarTodos() {
    await supabase.from("alertas").update({ lido_em: new Date().toISOString() })
      .eq("usuario_id", usuarioId).is("lido_em", null);
    recarregar();
  }

  return (
    <div className="relative">
      <button onClick={abrir} className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[#163A6B] hover:bg-gray-100" title="Avisos">
        <Icone nome="bell-outline" tamanho={21} />
        {naoLidos.length > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{naoLidos.length}</span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center border-b border-gray-100 p-3 text-sm font-semibold">
            Avisos
            {naoLidos.length > 0 && (
              <button className="ml-auto text-xs font-normal text-blue-700 hover:underline" onClick={marcarTodos}>Marcar todos como lidos</button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {alertas.length === 0 && <li className="p-4 text-center text-sm text-gray-500">Nenhum aviso.</li>}
            {alertas.map((a) => (
              <li key={a.id} className={`border-b border-gray-100 p-3 text-sm last:border-0 ${a.lido_em ? "text-gray-500" : "bg-blue-50"}`}>
                {a.mensagem}
                <div className="mt-0.5 text-xs text-gray-400">
                  {new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
