"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { OrdemServico, Tecnico } from "@/lib/tipos";

// Supervisor autoriza a pausa pedida pelo técnico e decide para onde vai a O.S.
export default function AutorizarPausa({ os, tecnicos, fechar }: { os: OrdemServico; tecnicos: Tecnico[]; fechar: () => void }) {
  const [destino, setDestino] = useState("manter");
  const [salvando, setSalvando] = useState(false);

  async function autorizar() {
    setSalvando(true);
    const campos =
      destino === "manter" ? { status: "aceita" }
      : destino === "backlog" ? { status: "rascunho", tecnico_id: null }
      : { status: "enviada", tecnico_id: destino };
    const { error } = await supabase.from("ordens_servico")
      .update({ ...campos, observacao_supervisor: `Pausa autorizada: ${os.pausa_motivo ?? ""}`.trim() })
      .eq("id", os.id);
    setSalvando(false);
    if (error) return alert(error.message);
    fechar();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Autorizar pausa · O.S. #{os.numero}</h2>
        <p className="mt-1 text-sm text-gray-600">
          {os.tecnico?.nome ?? "O técnico"} pediu pausa: <span className="font-medium">{os.pausa_motivo ?? "sem motivo"}</span>
        </p>
        <div className="mt-4 grid gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={destino === "manter"} onChange={() => setDestino("manter")} />
            Manter com {os.tecnico?.nome ?? "o técnico"} para retomar depois
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={destino === "backlog"} onChange={() => setDestino("backlog")} />
            Voltar ao backlog
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={destino !== "manter" && destino !== "backlog"}
              onChange={() => setDestino(tecnicos.find((t) => t.id !== os.tecnico_id)?.id ?? "manter")} />
            Remanejar para
            <select className="rounded border border-gray-300 p-1" value={destino !== "manter" && destino !== "backlog" ? destino : ""}
              onChange={(e) => setDestino(e.target.value)}>
              <option value="" disabled>técnico...</option>
              {tecnicos.filter((t) => t.id !== os.tecnico_id).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100" onClick={fechar}>Cancelar</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-40" disabled={salvando} onClick={autorizar}>
            Autorizar pausa
          </button>
        </div>
      </div>
    </div>
  );
}
