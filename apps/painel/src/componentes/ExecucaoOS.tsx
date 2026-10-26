"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Item = { id: string; nome: string; unidade: string; categoria: "servico" | "material"; aprovado?: boolean };
type Lancamento = { id: string; quantidade: number; observacao: string | null; lancado_em: string; item: Item | null; autor: { nome: string } | null };
type Apoio = { tecnico_id: string; tecnico: { nome: string } | null };
type Pessoa = { id: string; nome: string };

// Serviços executados, materiais utilizados e técnicos de apoio da O.S. (atualiza em tempo real).
// bloqueado: O.S. encerrada, só leitura até ser reaberta.
export default function ExecucaoOS({ osId, responsavelId, bloqueado = false }: { osId: string; responsavelId: string | null; bloqueado?: boolean }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [apoio, setApoio] = useState<Apoio[]>([]);
  const [catalogo, setCatalogo] = useState<Item[]>([]);
  const [tecnicos, setTecnicos] = useState<Pessoa[]>([]);
  const [novo, setNovo] = useState({ item_id: "", quantidade: "" });
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("os_servicos_executados")
      .select("id, quantidade, observacao, lancado_em, item:itens_execucao(id, nome, unidade, categoria, aprovado), autor:usuarios!os_servicos_executados_lancado_por_fkey(nome)")
      .eq("os_id", osId).order("lancado_em")
      .then(({ data }) => setLancamentos((data as unknown as Lancamento[]) ?? []));
    supabase.from("os_tecnicos_apoio").select("tecnico_id, tecnico:usuarios!os_tecnicos_apoio_tecnico_id_fkey(nome)").eq("os_id", osId)
      .then(({ data }) => setApoio((data as unknown as Apoio[]) ?? []));
  }, [osId, versao]);

  useEffect(() => {
    supabase.from("itens_execucao").select("id, nome, unidade, categoria").eq("ativo", true).order("ordem")
      .then(({ data }) => setCatalogo(data ?? []));
    supabase.from("usuarios").select("id, nome").eq("papel", "tecnico").eq("ativo", true).order("nome")
      .then(({ data }) => setTecnicos(data ?? []));
    const filtro = `os_id=eq.${osId}`;
    const canal = supabase
      .channel(`execucao-${osId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_servicos_executados", filter: filtro }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_tecnicos_apoio", filter: filtro }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [osId, recarregar]);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    const quantidade = Number(novo.quantidade.replace(",", "."));
    if (!novo.item_id || !(quantidade > 0)) return;
    const { error } = await supabase.from("os_servicos_executados").insert({ os_id: osId, item_id: novo.item_id, quantidade });
    if (error) return alert(error.message);
    setNovo({ item_id: "", quantidade: "" });
    recarregar();
  }

  async function remover(l: Lancamento) {
    if (!confirm(`Remover ${l.item?.nome}?`)) return;
    const { error } = await supabase.from("os_servicos_executados").delete().eq("id", l.id);
    if (error) alert(error.message);
    recarregar();
  }

  async function adicionarApoio(tecnicoId: string) {
    if (!tecnicoId) return;
    const { error } = await supabase.from("os_tecnicos_apoio").insert({ os_id: osId, tecnico_id: tecnicoId });
    if (error) alert(error.message);
    recarregar();
  }

  async function removerApoio(tecnicoId: string) {
    const { error } = await supabase.from("os_tecnicos_apoio").delete().eq("os_id", osId).eq("tecnico_id", tecnicoId);
    if (error) alert(error.message);
    recarregar();
  }

  const fmt = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const disponiveis = tecnicos.filter((t) => t.id !== responsavelId && !apoio.some((a) => a.tecnico_id === t.id));

  return (
    <>
      <h3 className="mt-6 font-semibold">Técnicos de apoio</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {apoio.length === 0 && <span className="text-gray-500">Nenhum.</span>}
        {apoio.map((a) => (
          <span key={a.tecnico_id} className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
            {a.tecnico?.nome}
            {!bloqueado && <button className="text-gray-500 hover:text-red-700" onClick={() => removerApoio(a.tecnico_id)} title="Remover">×</button>}
          </span>
        ))}
        {!bloqueado && disponiveis.length > 0 && (
          <select className="rounded-lg border border-gray-300 p-1.5" value="" onChange={(e) => adicionarApoio(e.target.value)}>
            <option value="">+ Adicionar apoio</option>
            {disponiveis.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        )}
      </div>

      {(["servico", "material"] as const).map((categoria) => {
        const doTipo = lancamentos.filter((l) => l.item?.categoria === categoria);
        return (
          <div key={categoria}>
            <h3 className="mt-6 font-semibold">{categoria === "servico" ? "Serviços executados" : "Materiais utilizados"} ({doTipo.length})</h3>
            {doTipo.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Nada lançado ainda.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {doTipo.map((l) => (
                    <tr key={l.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5">{l.item?.nome}{l.item?.aprovado === false ? <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">aguardando aprovação</span> : null}{l.observacao ? <span className="text-gray-500"> · {l.observacao}</span> : null}</td>
                      <td className="py-1.5 text-right font-medium">{fmt(l.quantidade)} {l.item?.unidade}</td>
                      <td className="py-1.5 pl-3 text-xs text-gray-500">{l.autor?.nome}</td>
                      <td className="py-1.5 pl-2 text-right">
                        {!bloqueado && <button className="text-xs text-red-700 hover:underline" onClick={() => remover(l)}>remover</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {!bloqueado && <form onSubmit={lancar} className="mt-3 flex flex-wrap gap-2 text-sm">
        <select className="flex-1 rounded-lg border border-gray-300 p-1.5" value={novo.item_id} onChange={(e) => setNovo({ ...novo, item_id: e.target.value })}>
          <option value="">Lançar serviço ou material...</option>
          <optgroup label="Serviços">
            {catalogo.filter((c) => c.categoria === "servico").map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.unidade})</option>)}
          </optgroup>
          <optgroup label="Materiais">
            {catalogo.filter((c) => c.categoria === "material").map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.unidade})</option>)}
          </optgroup>
        </select>
        <input className="w-28 rounded-lg border border-gray-300 p-1.5" placeholder="Quantidade" inputMode="decimal"
          value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
        <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50">Lançar</button>
      </form>}
    </>
  );
}
