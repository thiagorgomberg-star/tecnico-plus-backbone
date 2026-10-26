"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { OrdemServico, Tecnico } from "@/lib/tipos";

type Modo = "tecnico" | "backlog" | "supervisor";

// Reabre uma O.S. encerrada: volta para campo (o mesmo técnico ou outro, que recebe o aviso)
// volta para o backlog geral (qualquer técnico assume pelo app) ou fica com o supervisor para alterar e dar a baixa de novo.
export default function ReabrirOS({ os, fechar, reaberta }: { os: OrdemServico; fechar: () => void; reaberta?: (modo: Modo) => void }) {
  const [modo, setModo] = useState<Modo>("tecnico");
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [tecnicoId, setTecnicoId] = useState(os.tecnico_id ?? "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.from("usuarios").select("id, nome").eq("papel", "tecnico").eq("ativo", true).order("nome")
      .then(({ data }) => setTecnicos(data ?? []));
  }, []);

  async function confirmar() {
    setErro("");
    if (!motivo.trim()) return setErro("Informe o motivo da reabertura.");
    if (modo === "tecnico" && !tecnicoId) return setErro("Escolha o técnico.");
    setSalvando(true);
    const { error } = await supabase.rpc("reabrir_os", {
      p_os: os.id, p_modo: modo, p_tecnico: modo === "tecnico" ? tecnicoId : null, p_motivo: motivo.trim(),
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    reaberta?.(modo);
    fechar();
  }

  const opcao = (ativo: boolean) =>
    `flex-1 rounded-lg border p-3 text-left text-sm ${ativo ? "border-blue-700 bg-blue-50 ring-1 ring-blue-700" : "border-gray-300 hover:bg-gray-50"}`;
  const outro = modo === "tecnico" && tecnicoId && tecnicoId !== os.tecnico_id;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={fechar}>
      <div className="mt-16 w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Reabrir O.S. #{os.numero}</h2>
        <p className="text-sm text-gray-500">{os.titulo}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button className={opcao(modo === "tecnico")} onClick={() => setModo("tecnico")}>
            <div className="font-semibold">Devolver para campo</div>
            <div className="text-gray-600">Volta como nova O.S. para o técnico escolhido, com aviso no celular.</div>
          </button>
          <button className={opcao(modo === "backlog")} onClick={() => setModo("backlog")}>
            <div className="font-semibold">Voltar para o backlog</div>
            <div className="text-gray-600">Fica sem técnico, no backlog geral. Qualquer técnico pode assumir pelo app.</div>
          </button>
          {os.status !== "concluida" && (
          <button className={opcao(modo === "supervisor")} onClick={() => setModo("supervisor")}>
            <div className="font-semibold">Reabrir para eu editar</div>
            <div className="text-gray-600">
              {os.concluida_em ? "Volta para Aguardando baixa. Você altera os dados e dá a baixa de novo." : "Volta para o backlog. Você altera os dados e despacha de novo."}
            </div>
          </button>
          )}
        </div>

        {modo === "tecnico" && (
          <label className="mt-4 block text-sm">Técnico
            <select className="mt-1 w-full rounded-lg border border-gray-300 p-2" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">Escolha...</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}{t.id === os.tecnico_id ? " (mesmo técnico)" : ""}</option>
              ))}
            </select>
            {outro && <span className="mt-1 block text-xs text-amber-700">A O.S. passa para outro técnico, com as fotos e caixas já registradas.</span>}
          </label>
        )}

        <label className="mt-4 block text-sm">Motivo
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 p-2" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={modo !== "supervisor" ? "Ex.: faltou a foto da bandeja da caixa CE-BKB-0012" : "Ex.: corrigir o endereço e o material lançado"} />
        </label>

        {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-sm hover:bg-gray-100" onClick={fechar}>Voltar</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            disabled={salvando} onClick={confirmar}>{salvando ? "Reabrindo..." : "Reabrir"}</button>
        </div>
      </div>
    </div>
  );
}
