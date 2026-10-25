"use client";

import { useCallback, useEffect, useState } from "react";

import { excluirComConfirmacao } from "@/lib/excluir";
import { supabase } from "@/lib/supabase";

type Item = {
  id: string; nome: string; unidade: string; categoria: "servico" | "material"; ordem: number; ativo: boolean; aprovado: boolean;
  sugerido_em: string | null; autor: { nome: string } | null; os: { numero: number } | null;
};

const CATEGORIAS = [
  { valor: "servico" as const, rotulo: "Serviços executados" },
  { valor: "material" as const, rotulo: "Materiais utilizados" },
];

// Lista que o técnico usa para lançar o que executou e o que gastou na O.S.
// Itens cadastrados pelo técnico em campo chegam como "aguardando aprovação" (já lançados na O.S.).
export default function Catalogo() {
  const [itens, setItens] = useState<Item[]>([]);
  const [form, setForm] = useState({ categoria: "servico" as Item["categoria"], nome: "", unidade: "un" });
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("itens_execucao")
      .select("*, autor:usuarios!itens_execucao_sugerido_por_fkey(nome), os:ordens_servico!itens_execucao_sugerido_os_fkey(numero)")
      .order("ordem").order("nome")
      .then(({ data }) => setItens(data ?? []));
  }, [versao]);

  async function incluir(e: React.FormEvent) {
    e.preventDefault();
    const ordem = Math.max(0, ...itens.filter((i) => i.categoria === form.categoria).map((i) => i.ordem)) + 1;
    const { error } = await supabase.from("itens_execucao").insert({ ...form, nome: form.nome.trim().toUpperCase(), unidade: form.unidade.trim(), ordem });
    if (error) return alert(error.message.includes("duplicate") ? "Já existe um item com esse nome." : error.message);
    setForm({ ...form, nome: "" });
    recarregar();
  }

  async function atualizar(item: Item, campos: Partial<Item>) {
    const { error } = await supabase.from("itens_execucao").update(campos).eq("id", item.id);
    if (error) alert(error.message);
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2";
  const pendentes = itens.filter((i) => !i.aprovado && i.ativo);
  const aprovados = itens.filter((i) => i.aprovado || !i.ativo);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Serviços e materiais</h2>
      <form onSubmit={incluir} className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4 text-sm">
        <select className={campo} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Item["categoria"] })}>
          <option value="servico">Serviço</option>
          <option value="material">Material</option>
        </select>
        <input className={`${campo} min-w-56 flex-1`} placeholder={form.categoria === "servico" ? "Ex.: Lançamento de cabo" : "Ex.: Cabo óptico 36F"}
          value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className={`${campo} w-24`} placeholder="Unidade" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} required
          list="unidades" />
        <datalist id="unidades">
          {["un", "m", "km", "pç", "cx", "rolo", "kg", "h"].map((u) => <option key={u} value={u} />)}
        </datalist>
        <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">Incluir</button>
      </form>

      {pendentes.length ? (
        <div className="border-b border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Aguardando aprovação ({pendentes.length})</h3>
          <p className="text-xs text-amber-800">Cadastrados pelo técnico em campo e já lançados na O.S. Corrija o nome ou a unidade se precisar e aprove. Recusar tira o item da lista.</p>
          <ul className="mt-2 space-y-1.5">
            {pendentes.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 text-sm">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{i.categoria === "servico" ? "Serviço" : "Material"}</span>
                <input className="min-w-48 flex-1 rounded border border-gray-200 px-1.5 py-1 uppercase" defaultValue={i.nome}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim().toUpperCase() !== i.nome && atualizar(i, { nome: e.target.value.trim().toUpperCase() })} />
                <input className="w-16 rounded border border-gray-200 px-1.5 py-1" defaultValue={i.unidade}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== i.unidade && atualizar(i, { unidade: e.target.value.trim() })} />
                <span className="text-xs text-gray-500">{i.autor?.nome ?? "—"}{i.os ? ` · O.S. #${i.os.numero}` : ""}{i.sugerido_em ? ` · ${new Date(i.sugerido_em).toLocaleDateString("pt-BR")}` : ""}</span>
                <button className="rounded-lg bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800" onClick={() => atualizar(i, { aprovado: true })}>Aprovar</button>
                <button className="rounded-lg border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50" onClick={() => atualizar(i, { ativo: false })}>Recusar</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-px bg-gray-100 md:grid-cols-2">
        {CATEGORIAS.map((c) => (
          <div key={c.valor} className="bg-white">
            <h3 className="px-4 pt-4 text-sm font-semibold text-gray-600">{c.rotulo}</h3>
            <ul className="p-2">
              {aprovados.filter((i) => i.categoria === c.valor).length === 0 && (
                <li className="p-2 text-sm text-gray-500">Nenhum item.</li>
              )}
              {aprovados.filter((i) => i.categoria === c.valor).map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-gray-50">
                  <input className={`flex-1 rounded border border-transparent px-1 hover:border-gray-200 ${i.ativo ? "" : "text-gray-400 line-through"}`}
                    defaultValue={i.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== i.nome && atualizar(i, { nome: e.target.value.trim() })} />
                  <input className="w-16 rounded border border-transparent px-1 text-gray-500 hover:border-gray-200" defaultValue={i.unidade}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== i.unidade && atualizar(i, { unidade: e.target.value.trim() })} />
                  <button className="text-xs text-gray-600 hover:underline" onClick={() => atualizar(i, { ativo: !i.ativo })}>
                    {i.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button className="text-xs text-red-700 hover:underline"
                    onClick={async () => (await excluirComConfirmacao(`"${i.nome}"`, () => supabase.from("itens_execucao").delete().eq("id", i.id))) && recarregar()}>
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
