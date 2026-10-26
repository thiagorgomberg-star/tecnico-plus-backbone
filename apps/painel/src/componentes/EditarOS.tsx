"use client";

import { useState } from "react";

import MaterialApoio from "@/componentes/MaterialApoio";
import { supabase } from "@/lib/supabase";
import { OrdemServico, Prioridade, TIPOS_OS } from "@/lib/tipos";

// Supervisor altera os dados da O.S. enquanto ela não está encerrada (baixada ou cancelada: reabrir antes).
export default function EditarOS({ os, fechar, salva }: { os: OrdemServico; fechar: () => void; salva?: () => void }) {
  const [f, setF] = useState({
    ticket: os.ticket_interno ? "" : os.ticket_acionamento ?? "",
    titulo: os.titulo,
    tipo: os.tipo,
    prioridade: os.prioridade,
    endereco: os.endereco ?? "",
    descricao: os.descricao ?? "",
    observacao_tecnico: os.observacao_tecnico ?? "",
    observacao_supervisor: os.observacao_supervisor ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [apoio, setApoio] = useState(false);
  const [erro, setErro] = useState("");
  const muda = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [campo]: e.target.value });

  async function salvar() {
    setErro("");
    if (!f.titulo.trim()) return setErro("Informe o título.");
    setSalvando(true);
    const ticket = f.ticket.trim();
    const { error } = await supabase.from("ordens_servico").update({
      titulo: f.titulo.trim(),
      tipo: f.tipo,
      prioridade: f.prioridade,
      endereco: f.endereco.trim() || null,
      descricao: f.descricao.trim() || null,
      observacao_tecnico: f.observacao_tecnico.trim() || null,
      observacao_supervisor: f.observacao_supervisor.trim() || null,
      // Em branco mantém o token gerado pelo sistema; informado, vira o ticket de acionamento.
      ...(ticket && ticket !== os.ticket_acionamento ? { ticket_acionamento: ticket, ticket_interno: false } : {}),
    }).eq("id", os.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    salva?.();
    fechar();
  }

  const campo = "mt-1 w-full rounded-lg border border-gray-300 p-2";
  const tipos = TIPOS_OS.includes(os.tipo) ? TIPOS_OS : [os.tipo, ...TIPOS_OS];

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={fechar}>
      <div className="mt-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">Editar O.S. #{os.numero}</h2>
        <div className="grid gap-3 text-sm">
          <label>Ticket de acionamento
            <input className={campo} value={f.ticket} onChange={muda("ticket")}
              placeholder={os.ticket_interno ? `Token do sistema: ${os.ticket_acionamento}` : ""} />
          </label>
          <label>Título<input className={campo} value={f.titulo} onChange={muda("titulo")} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>Tipo
              <select className={campo} value={f.tipo} onChange={muda("tipo")}>
                {tipos.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Prioridade
              <select className={campo} value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as Prioridade })}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="emergencia">Emergência</option>
              </select>
            </label>
          </div>
          <label>Endereço ou referência<input className={campo} value={f.endereco} onChange={muda("endereco")} /></label>
          <label>Descrição<textarea className={campo} rows={3} value={f.descricao} onChange={muda("descricao")} /></label>
          <label>Observação do técnico<textarea className={campo} rows={3} value={f.observacao_tecnico} onChange={muda("observacao_tecnico")} /></label>
          <label>Observação do supervisor<textarea className={campo} rows={2} value={f.observacao_supervisor} onChange={muda("observacao_supervisor")} /></label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Serviços, materiais e técnicos de apoio são alterados direto no detalhe da O.S.</p>
        {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="mr-auto rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setApoio(true)}>
            📎 Material de apoio (anexar arquivos)
          </button>
          <button className="rounded-lg px-4 py-2 text-sm hover:bg-gray-100" onClick={fechar}>Cancelar</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            disabled={salvando} onClick={salvar}>{salvando ? "Salvando..." : "Salvar alterações"}</button>
        </div>
      </div>
      {apoio && <div onClick={(e) => e.stopPropagation()}><MaterialApoio osId={os.id} numero={os.numero} fechar={() => setApoio(false)} /></div>}
    </div>
  );
}
