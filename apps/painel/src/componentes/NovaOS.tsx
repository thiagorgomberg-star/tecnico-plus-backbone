"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { Prioridade, Tecnico, TIPOS_OS } from "@/lib/tipos";

type Props = { tecnicos: Tecnico[]; fechar: () => void; criada: () => void };

export default function NovaOS({ tecnicos, fechar, criada }: Props) {
  const [ticket, setTicket] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState(TIPOS_OS[0]);
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [tecnicoId, setTecnicoId] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");

  async function salvar(enviar: boolean) {
    setErro("");
    if (!titulo.trim()) return setErro("Informe o título.");
    if (enviar && !tecnicoId) return setErro("Escolha o técnico para despachar, ou salve no backlog.");
    const { error } = await supabase.from("ordens_servico").insert({
      titulo: titulo.trim(),
      ticket_acionamento: ticket.trim() || null,
      tipo,
      prioridade,
      tecnico_id: tecnicoId || null,
      endereco: endereco || null,
      descricao: descricao || null,
      status: enviar ? "enviada" : "rascunho",
    });
    if (error) return setErro(error.message);
    criada();
    fechar();
  }

  const campo = "w-full rounded-lg border border-gray-300 p-2";

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Nova ordem de serviço</h2>
        <div className="grid gap-3">
          <label className="text-sm">Ticket de acionamento (opcional)
            <input className={campo} value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Em branco: o sistema gera um token de 16 dígitos" />
          </label>
          <label className="text-sm">Título
            <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Rompimento de fibra no km 12" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Tipo
              <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_OS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">Prioridade
              <select className={campo} value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="emergencia">Emergência</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Técnico
              <select className={campo} value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                <option value="">Escolher depois</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
          </div>
          <label className="text-sm">Endereço ou referência
            <input className={campo} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </label>
          <label className="text-sm">Descrição
            <textarea className={campo} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
        </div>
        {erro && <p className="mt-3 text-sm text-red-700">{erro}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={fechar}>Cancelar</button>
          <button className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50" onClick={() => salvar(false)}>Salvar no backlog</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800" onClick={() => salvar(true)}>Despachar ao técnico</button>
        </div>
      </div>
    </div>
  );
}
