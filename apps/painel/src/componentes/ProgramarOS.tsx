"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { OrdemServico, Tecnico } from "@/lib/tipos";

const doisDig = (n: number) => String(n).padStart(2, "0");
const diaLocal = (d: Date) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;

// Programa uma O.S. do backlog para um dia: até lá ela fica fora do backlog do app;
// no dia, se tiver técnico, vai para ele às 08h (com o aviso de Nova O.S.); sem técnico, entra no backlog geral.
export default function ProgramarOS({ os, fechar, salva }: { os: OrdemServico; fechar: () => void; salva: () => void }) {
  const atual = os.programada_inicio ? new Date(os.programada_inicio) : null;
  const amanha = new Date(Date.now() + 86400000);
  const [dia, setDia] = useState(diaLocal(atual ?? amanha));
  const [hora, setHora] = useState(atual ? `${doisDig(atual.getHours())}:${doisDig(atual.getMinutes())}` : "08:00");
  const [duracaoH, setDuracaoH] = useState(() => {
    if (!os.programada_inicio || !os.programada_fim) return "1";
    return String((new Date(os.programada_fim).getTime() - new Date(os.programada_inicio).getTime()) / 3600000);
  });
  const [tecnicoId, setTecnicoId] = useState(os.tecnico_id ?? "");
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from("usuarios").select("id, nome").eq("papel", "tecnico").eq("ativo", true).is("excluido_em", null).order("nome")
      .then(({ data }) => setTecnicos(data ?? []));
  }, []);

  async function gravar(limpar = false) {
    setSalvando(true);
    const inicio = new Date(`${dia}T${hora}:00`);
    const campos = limpar
      ? { programada_inicio: null, programada_fim: null }
      : {
          programada_inicio: inicio.toISOString(),
          programada_fim: new Date(inicio.getTime() + Math.max(0.25, Number(duracaoH) || 1) * 3600000).toISOString(),
          tecnico_id: tecnicoId || null,
        };
    const { error } = await supabase.from("ordens_servico").update(campos).eq("id", os.id);
    setSalvando(false);
    if (error) return alert(error.message);
    salva();
    fechar();
  }

  const rotulo = "grid gap-1 text-sm";
  const campo = "rounded-lg border border-gray-300 p-2";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Programar O.S. #{os.numero}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Até o dia escolhido ela fica fora do backlog do app. No dia, com técnico escolhido, vai para ele às 08h com o aviso de Nova O.S.; sem técnico, entra no backlog geral.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className={rotulo}><span className="font-medium text-gray-700">Dia</span>
            <input type="date" className={campo} value={dia} min={diaLocal(new Date())} onChange={(e) => setDia(e.target.value)} />
          </label>
          <label className={rotulo}><span className="font-medium text-gray-700">Hora de início</span>
            <input type="time" step={900} className={campo} value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label className={rotulo}><span className="font-medium text-gray-700">Duração (horas)</span>
            <input type="number" min={0.25} step={0.25} className={campo} value={duracaoH} onChange={(e) => setDuracaoH(e.target.value)} />
          </label>
          <label className={rotulo}><span className="font-medium text-gray-700">Técnico (opcional)</span>
            <select className={campo} value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">Backlog geral</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {atual && (
            <button className="mr-auto rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50" disabled={salvando} onClick={() => gravar(true)}>
              Tirar programação
            </button>
          )}
          <button className="rounded-lg px-4 py-2 text-sm hover:bg-gray-100" onClick={fechar}>Cancelar</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            disabled={salvando || !dia || !hora} onClick={() => gravar()}>{salvando ? "Salvando..." : "Programar"}</button>
        </div>
      </div>
    </div>
  );
}
