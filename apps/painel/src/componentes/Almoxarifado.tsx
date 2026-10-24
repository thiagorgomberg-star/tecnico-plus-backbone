"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type SaldoCentral = { item_id: string; nome: string; unidade: string; ativo: boolean; saldo: number };
type SaldoTecnico = { tecnico_id: string; tecnico: string; item_id: string; nome: string; unidade: string; saldo: number };
type Movimento = {
  id: string; tipo: string; quantidade: number; observacao: string | null; criado_em: string;
  item: { nome: string; unidade: string } | null; tecnico: { nome: string } | null; os: { numero: number } | null;
};

const ROTULO: Record<string, string> = {
  entrada: "Entrada", liberacao: "Liberação", devolucao: "Devolução", consumo: "Consumo em O.S.", ajuste: "Ajuste",
};
const fmt = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Almoxarifado backbone: estoque central, liberação para técnicos, devolução e consumo nas O.S.
export default function Almoxarifado({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [central, setCentral] = useState<SaldoCentral[]>([]);
  const [porTecnico, setPorTecnico] = useState<SaldoTecnico[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [form, setForm] = useState({ tipo: "liberacao", item_id: "", tecnico_id: "", quantidade: "", observacao: "" });
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("saldo_almoxarifado").select("*").order("nome").then(({ data }) => setCentral(data ?? []));
    supabase.from("saldo_tecnicos").select("*").order("tecnico").order("nome").then(({ data }) => setPorTecnico(data ?? []));
    supabase.from("estoque_movimentos")
      .select("id, tipo, quantidade, observacao, criado_em, item:itens_execucao(nome, unidade), tecnico:usuarios!estoque_movimentos_tecnico_id_fkey(nome), os:ordens_servico(numero)")
      .order("criado_em", { ascending: false }).limit(50)
      .then(({ data }) => setMovimentos((data as unknown as Movimento[]) ?? []));
  }, [versao]);

  useEffect(() => {
    const canal = supabase
      .channel("almoxarifado")
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque_movimentos" }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recarregar]);

  const precisaTecnico = form.tipo === "liberacao" || form.tipo === "devolucao";

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    const quantidade = Number(form.quantidade.replace(",", "."));
    if (!form.item_id || !(quantidade > 0)) return alert("Escolha o material e informe a quantidade.");
    if (precisaTecnico && !form.tecnico_id) return alert("Escolha o técnico.");
    if (form.tipo === "liberacao") {
      const disponivel = central.find((c) => c.item_id === form.item_id)?.saldo ?? 0;
      if (quantidade > disponivel && !confirm(`O almoxarifado tem ${fmt(disponivel)}. Liberar ${fmt(quantidade)} mesmo assim?`)) return;
    }
    const { error } = await supabase.from("estoque_movimentos").insert({
      tipo: form.tipo, item_id: form.item_id, quantidade,
      tecnico_id: precisaTecnico ? form.tecnico_id : null, observacao: form.observacao || null,
    });
    if (error) return alert(error.message);
    setForm({ ...form, quantidade: "", observacao: "" });
    recarregar();
  }

  const tecnicosComSaldo = useMemo(() => {
    const grupos = new Map<string, { nome: string; itens: SaldoTecnico[] }>();
    for (const s of porTecnico) {
      if (!grupos.has(s.tecnico_id)) grupos.set(s.tecnico_id, { nome: s.tecnico, itens: [] });
      grupos.get(s.tecnico_id)!.itens.push(s);
    }
    return [...grupos.entries()];
  }, [porTecnico]);

  const campo = "rounded-lg border border-gray-300 p-2";

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 p-4 font-semibold">Movimentar estoque</h2>
        <form onSubmit={lancar} className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <select className={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="liberacao">Liberar para técnico</option>
            <option value="devolucao">Devolução do técnico</option>
            <option value="entrada">Entrada no almoxarifado</option>
          </select>
          <select className={`${campo} min-w-48 flex-1`} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
            <option value="">Material...</option>
            {central.filter((c) => c.ativo).map((c) => <option key={c.item_id} value={c.item_id}>{c.nome} ({c.unidade}) · estoque {fmt(c.saldo)}</option>)}
          </select>
          {precisaTecnico && (
            <select className={campo} value={form.tecnico_id} onChange={(e) => setForm({ ...form, tecnico_id: e.target.value })}>
              <option value="">Técnico...</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          )}
          <input className={`${campo} w-28`} placeholder="Quantidade" inputMode="decimal" value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
          <input className={`${campo} min-w-40 flex-1`} placeholder="Observação (NF, requisição...)" value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">Lançar</button>
        </form>
        {central.length === 0 && (
          <p className="px-4 pb-4 text-sm text-gray-500">Cadastre os materiais na aba &quot;Serviços e materiais&quot; para movimentar o estoque.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 p-4 font-semibold">Almoxarifado central</h2>
          <table className="w-full text-sm">
            <tbody>
              {central.map((c) => (
                <tr key={c.item_id} className="border-b border-gray-100 last:border-0">
                  <td className="p-3">{c.nome}</td>
                  <td className={`p-3 text-right font-medium ${c.saldo < 0 ? "text-red-700" : ""}`}>{fmt(c.saldo)} {c.unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 p-4 font-semibold">Em poder dos técnicos</h2>
          {tecnicosComSaldo.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum material liberado.</p>}
          {tecnicosComSaldo.map(([id, grupo]) => (
            <div key={id} className="border-b border-gray-100 p-3 last:border-0">
              <div className="font-medium">{grupo.nome}</div>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {grupo.itens.map((s) => (
                    <tr key={s.item_id}>
                      <td className="py-0.5 text-gray-700">{s.nome}</td>
                      <td className={`py-0.5 text-right font-medium ${s.saldo < 0 ? "text-red-700" : ""}`}>{fmt(s.saldo)} {s.unidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 p-4 font-semibold">Últimas movimentações</h2>
        <table className="w-full text-sm">
          <tbody>
            {movimentos.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0">
                <td className="p-3 text-gray-500">{new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="p-3">{ROTULO[m.tipo] ?? m.tipo}{m.os ? ` · O.S. #${m.os.numero}` : ""}</td>
                <td className="p-3">{m.item?.nome}</td>
                <td className="p-3 text-right font-medium">{fmt(m.quantidade)} {m.item?.unidade}</td>
                <td className="p-3 text-gray-600">{m.tecnico?.nome ?? "—"}</td>
                <td className="p-3 text-gray-500">{m.observacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
