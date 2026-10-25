"use client";

import { useCallback, useEffect, useState } from "react";

import { excluirComConfirmacao } from "@/lib/excluir";
import { supabase } from "@/lib/supabase";

type Atividade = { id: string; tipo: string; nome: string; ordem: number; ativo: boolean };

const TIPOS = ["Preventiva rede", "Preventiva site", "Vistoria Backbone MG"];

// Lista de atividades que o técnico marca ao abrir uma preventiva no app.
export default function AtividadesPreventiva() {
  const [itens, setItens] = useState<Atividade[]>([]);
  const [form, setForm] = useState({ tipo: TIPOS[0], nome: "" });
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("atividades_preventiva").select("*").order("ordem").order("nome")
      .then(({ data }) => setItens(data ?? []));
  }, [versao]);

  async function incluir(e: React.FormEvent) {
    e.preventDefault();
    const ordem = Math.max(0, ...itens.filter((i) => i.tipo === form.tipo).map((i) => i.ordem)) + 1;
    const { error } = await supabase.from("atividades_preventiva").insert({ tipo: form.tipo, nome: form.nome.trim(), ordem });
    if (error) return alert(error.message.includes("duplicate") ? "Essa atividade já existe nesse tipo." : error.message);
    setForm({ ...form, nome: "" });
    recarregar();
  }

  async function atualizar(item: Atividade, campos: Partial<Atividade>) {
    const { error } = await supabase.from("atividades_preventiva").update(campos).eq("id", item.id);
    if (error) alert(error.message);
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2";

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Atividades de preventiva</h2>
      <form onSubmit={incluir} className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4 text-sm">
        <select className={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className={`${campo} min-w-56 flex-1`} placeholder="Ex.: Verificação das caixas de emenda"
          value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">Incluir</button>
      </form>

      <div className="grid gap-px bg-gray-100 md:grid-cols-3">
        {TIPOS.map((t) => (
          <div key={t} className="bg-white">
            <h3 className="px-4 pt-4 text-sm font-semibold text-gray-600">{t}</h3>
            <ul className="p-2">
              {itens.filter((i) => i.tipo === t).length === 0 && <li className="p-2 text-sm text-gray-500">Nenhuma atividade.</li>}
              {itens.filter((i) => i.tipo === t).map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-gray-50">
                  <input className={`flex-1 rounded border border-transparent px-1 hover:border-gray-200 ${i.ativo ? "" : "text-gray-400 line-through"}`}
                    defaultValue={i.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== i.nome && atualizar(i, { nome: e.target.value.trim() })} />
                  <button className="text-xs text-gray-600 hover:underline" onClick={() => atualizar(i, { ativo: !i.ativo })}>
                    {i.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button className="text-xs text-red-700 hover:underline"
                    onClick={async () => (await excluirComConfirmacao(`"${i.nome}"`, () => supabase.from("atividades_preventiva").delete().eq("id", i.id))) && recarregar()}>
                    Excluir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
