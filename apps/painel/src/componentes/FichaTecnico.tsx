"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

// Ficha completa do técnico (Equipe > nome). Os dados pessoais só são vistos pelo próprio técnico e pelo supervisor.
type Campo = { k: string; rotulo: string; tipo?: string; dica?: string; largo?: boolean };
const SECOES: [string, Campo[]][] = [
  ["Identificação", [
    { k: "nome", rotulo: "Nome completo (sai na foto)" },
    { k: "cargo", rotulo: "Cargo (sai na foto)" },
    { k: "matricula", rotulo: "Matrícula" },
    { k: "cpf", rotulo: "CPF", dica: "000.000.000-00" },
    { k: "rg", rotulo: "RG" },
    { k: "data_nascimento", rotulo: "Data de nascimento", tipo: "date" },
    { k: "data_admissao", rotulo: "Data de admissão", tipo: "date" },
  ]],
  ["Contato", [
    { k: "telefone", rotulo: "Telefone", dica: "(11) 99999-9999" },
    { k: "email_contato", rotulo: "E-mail de contato", tipo: "email" },
    { k: "endereco", rotulo: "Endereço", largo: true },
    { k: "contato_emergencia", rotulo: "Contato de emergência (nome)" },
    { k: "telefone_emergencia", rotulo: "Telefone de emergência" },
  ]],
  ["CNH", [
    { k: "cnh_numero", rotulo: "Número da CNH" },
    { k: "cnh_categoria", rotulo: "Categoria", dica: "B, AB..." },
    { k: "cnh_validade", rotulo: "Validade da CNH", tipo: "date" },
  ]],
  ["Uniforme e EPI", [
    { k: "tamanho_camisa", rotulo: "Camisa", dica: "P, M, G, GG" },
    { k: "tamanho_calca", rotulo: "Calça", dica: "40, 42..." },
    { k: "tamanho_calcado", rotulo: "Calçado / botina", dica: "40, 41..." },
  ]],
];
const CAMPOS = SECOES.flatMap(([, c]) => c.map((x) => x.k));

export default function FichaTecnico({ id, fechar, aoSalvar }: { id: string; fechar: () => void; aoSalvar: () => void }) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.from("usuarios").select([...CAMPOS, "observacao"].join(", ")).eq("id", id).single().then(({ data }) => {
      if (data) setDados(Object.fromEntries(Object.entries(data as unknown as Record<string, string | null>).map(([k, v]) => [k, v ?? ""])));
    });
  }, [id]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados.nome?.trim()) return setErro("O nome é obrigatório.");
    setSalvando(true);
    const linha = Object.fromEntries([...CAMPOS, "observacao"].map((k) => [k, dados[k]?.trim() || null]));
    const { error } = await supabase.from("usuarios").update(linha).eq("id", id);
    setSalvando(false);
    if (error) return setErro(error.message);
    aoSalvar();
    fechar();
  }

  const vencida = dados.cnh_validade && dados.cnh_validade < new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <form className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="mb-2 flex items-center">
          <h2 className="mr-auto text-lg font-semibold">Ficha do técnico</h2>
          <button type="button" className="text-2xl leading-none text-gray-500" onClick={fechar} aria-label="Fechar">×</button>
        </div>
        {SECOES.map(([titulo, campos]) => (
          <fieldset key={titulo} className="mt-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{titulo}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {campos.map((c) => (
                <label key={c.k} className={`grid gap-1 text-xs text-gray-600 ${c.largo ? "sm:col-span-3" : ""}`}>
                  {c.rotulo}
                  <input type={c.tipo ?? "text"} placeholder={c.dica} value={dados[c.k] ?? ""}
                    className={`rounded-lg border p-2 text-sm text-gray-900 ${c.k === "cnh_validade" && vencida ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                    onChange={(e) => setDados({ ...dados, [c.k]: e.target.value })} />
                </label>
              ))}
            </div>
            {titulo === "CNH" && vencida && <p className="mt-1 text-xs font-medium text-red-700">CNH vencida.</p>}
          </fieldset>
        ))}
        <label className="mt-3 grid gap-1 text-xs text-gray-600">
          Observações
          <textarea className="min-h-16 rounded-lg border border-gray-300 p-2 text-sm text-gray-900" value={dados.observacao ?? ""}
            onChange={(e) => setDados({ ...dados, observacao: e.target.value })} />
        </label>
        <p className="mt-2 text-xs text-gray-500">Nome, cargo e CPF/RG saem na O.S. de apresentação (abordagem policial).</p>
        <div className="mt-4 flex items-center gap-2">
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar ficha"}
          </button>
          <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={fechar}>Cancelar</button>
          {erro && <span className="text-sm text-red-700">{erro}</span>}
        </div>
      </form>
    </div>
  );
}
