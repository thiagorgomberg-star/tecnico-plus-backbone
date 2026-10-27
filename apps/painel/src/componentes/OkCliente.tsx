"use client";

import { useState } from "react";

import { ClienteOS, darOkCliente } from "@/lib/clientes";

const agoraCampo = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const hm = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

// Baixa parcial por cliente: "✓ Cliente deu OK" com o horário em que o sinal voltou e a confirmação do NOC dele.
export default function OkCliente({ linha, podeEditar, mudou }: { linha: ClienteOS; podeEditar: boolean; mudou: (l: ClienteOS) => void }) {
  const [aberto, setAberto] = useState(false);
  const [restabelecido, setRestabelecido] = useState(agoraCampo());
  const [noc, setNoc] = useState(agoraCampo());
  const [contato, setContato] = useState("");
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!linha.id || !restabelecido) return setErro("Informe o horário em que o sinal voltou.");
    const ok = { restabelecido_em: new Date(restabelecido).toISOString(), noc_confirmado_em: noc ? new Date(noc).toISOString() : null, noc_contato: contato.trim() || null };
    try { await darOkCliente(linha.id, ok); } catch (e) { return setErro(e instanceof Error ? e.message : String(e)); }
    setAberto(false);
    mudou({ ...linha, ...ok });
  }
  async function desfazer() {
    if (!linha.id || !confirm("Desfazer o OK deste cliente?")) return;
    try { await darOkCliente(linha.id, null); } catch (e) { return alert(e instanceof Error ? e.message : String(e)); }
    mudou({ ...linha, restabelecido_em: null, noc_confirmado_em: null, noc_contato: null });
  }

  if (linha.restabelecido_em) {
    return (
      <div className="mt-2 rounded-md bg-green-50 px-2 py-1.5 text-green-900">
        <b>✓ Cliente deu OK</b> · sinal restabelecido {hm(linha.restabelecido_em)}
        {linha.noc_confirmado_em ? ` · NOC confirmou ${hm(linha.noc_confirmado_em)}` : ""}{linha.noc_contato ? ` (${linha.noc_contato})` : ""}
        {podeEditar && <button className="ml-2 text-xs text-green-800 underline" onClick={desfazer}>desfazer</button>}
      </div>
    );
  }
  if (!podeEditar || !linha.id) return null;
  if (!aberto) {
    return (
      <button className="mt-2 rounded-md border border-green-600 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50" onClick={() => setAberto(true)}>
        ☐ Cliente deu OK (baixa parcial)
      </button>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-green-200 bg-green-50 p-2 sm:grid-cols-3">
      <label className="text-xs text-gray-700">Sinal restabelecido em
        <input type="datetime-local" className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1 text-sm" value={restabelecido} onChange={(e) => setRestabelecido(e.target.value)} />
      </label>
      <label className="text-xs text-gray-700">NOC confirmou em
        <input type="datetime-local" className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1 text-sm" value={noc} onChange={(e) => setNoc(e.target.value)} />
      </label>
      <label className="text-xs text-gray-700">Quem confirmou no NOC (opcional)
        <input className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1 text-sm" value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome ou protocolo" />
      </label>
      {erro && <p className="text-xs text-red-700 sm:col-span-3">{erro}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button className="rounded-md bg-green-700 px-3 py-1 text-sm font-semibold text-white hover:bg-green-800" onClick={salvar}>Salvar OK</button>
        <button className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </div>
  );
}
