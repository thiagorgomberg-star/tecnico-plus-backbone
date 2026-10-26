"use client";

import { Cliente, ClienteOS, fmtSla } from "@/lib/clientes";

// Clientes atendidos no mesmo evento: cada um com o próprio ticket e texto de acionamento. O SLA da O.S. é o menor deles.
export default function EditorClientesOS({ clientes, linhas, mudar }: { clientes: Cliente[]; linhas: ClienteOS[]; mudar: (l: ClienteOS[]) => void }) {
  const campo = "w-full rounded-lg border border-gray-300 p-2 text-sm";
  const trocar = (i: number, parte: Partial<ClienteOS>) => mudar(linhas.map((l, j) => (j === i ? { ...l, ...parte } : l)));
  const ativos = clientes.filter((c) => c.ativo);
  const menor = Math.min(...linhas.map((l) => clientes.find((c) => c.id === l.cliente_id)?.sla_horas ?? Infinity));
  return (
    <div className="grid gap-2">
      {linhas.map((l, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-sm">Cliente
              <select className={campo} value={l.cliente_id} onChange={(e) => trocar(i, { cliente_id: e.target.value })}>
                <option value="">Escolha o cliente...</option>
                {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome} · SLA {fmtSla(c.sla_horas)}</option>)}
              </select>
            </label>
            <label className="flex-1 text-sm">Ticket do cliente
              <input className={campo} value={l.ticket} onChange={(e) => trocar(i, { ticket: e.target.value })} placeholder="Nº do chamado" />
            </label>
            <button type="button" className="mb-0.5 rounded-lg border border-gray-300 px-2 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={() => mudar(linhas.filter((_, j) => j !== i))} title="Tirar este cliente">✕</button>
          </div>
          <label className="text-sm">Texto de acionamento
            <textarea className={campo} rows={3} value={l.texto_acionamento} onChange={(e) => trocar(i, { texto_acionamento: e.target.value })}
              placeholder="Cole aqui o texto que o cliente mandou" />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="rounded-lg border border-dashed border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          onClick={() => mudar([...linhas, { cliente_id: "", ticket: "", texto_acionamento: "" }])}>
          + Adicionar cliente
        </button>
        {ativos.length === 0 && <span className="text-xs text-gray-500">Cadastre os clientes na aba Clientes.</span>}
        {Number.isFinite(menor) && <span className="text-xs text-gray-600">SLA da O.S.: {fmtSla(menor)} (o menor entre os clientes)</span>}
      </div>
    </div>
  );
}
