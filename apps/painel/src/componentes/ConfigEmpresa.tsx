"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

// Dados da empresa que saem na O.S. de apresentação (abordagem policial) gerada no app.
const CAMPOS: [string, string, string][] = [
  ["razao_social", "Razão social", "Multivale Engenharia"],
  ["cnpj", "CNPJ", "00.000.000/0000-00"],
  ["endereco", "Endereço", "Rua, número, cidade/UF"],
  ["telefone", "Telefone para confirmação (24h)", "(11) 99999-9999"],
  ["responsavel", "Responsável / supervisor", "Nome"],
  ["contratante", "Serviço prestado para (opcional)", "Operadora / cliente"],
];

export default function ConfigEmpresa() {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("config_empresa").select("*").maybeSingle().then(({ data }) => {
      if (data) setDados(Object.fromEntries(CAMPOS.map(([k]) => [k, (data as Record<string, string | null>)[k] ?? ""])));
    });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const linha = Object.fromEntries(CAMPOS.map(([k]) => [k, dados[k]?.trim() || null]));
    const { error } = await supabase.from("config_empresa").update({ ...linha, atualizado_em: new Date().toISOString() }).eq("id", true);
    setMsg(error ? error.message : "Salvo. Os técnicos recebem na próxima vez que abrirem a O.S. de apresentação com internet.");
  }

  return (
    <section className="max-w-2xl rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-1 text-lg font-semibold">Empresa (O.S. de apresentação)</h2>
      <p className="mb-4 text-sm text-gray-500">Saem no documento que o técnico mostra em caso de abordagem policial, junto com o nome, documento e veículo dele.</p>
      <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(([k, rotulo, exemplo]) => (
          <label key={k} className={`grid gap-1 text-xs text-gray-600 ${k === "endereco" ? "sm:col-span-2" : ""}`}>
            {rotulo}
            <input className="rounded-lg border border-gray-300 p-2 text-sm" placeholder={exemplo} value={dados[k] ?? ""}
              onChange={(e) => setDados({ ...dados, [k]: e.target.value })} />
          </label>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Salvar</button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      </form>
    </section>
  );
}
