"use client";

import { useCallback, useEffect, useState } from "react";

import ExcluirDados from "@/componentes/ExcluirDados";
import { supabase } from "@/lib/supabase";

type Membro = {
  id: string; nome: string; cargo: string | null; matricula: string | null; documento: string | null; papel: string; ativo: boolean;
  inicio_jornada: string; fim_jornada: string; fim_jornada_sexta: string; regime_horas: "hora_extra" | "banco_horas";
};

export default function Equipe({ aoMudar }: { aoMudar: () => void }) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", cargo: "Técnico de Backbone", matricula: "" });
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [versao, setVersao] = useState(0);
  const [excluir, setExcluir] = useState<Membro | null>(null);
  const recarregar = useCallback(() => { setVersao((v) => v + 1); aoMudar(); }, [aoMudar]);

  useEffect(() => {
    supabase.from("usuarios").select("id, nome, cargo, matricula, documento, papel, ativo, inicio_jornada, fim_jornada, fim_jornada_sexta, regime_horas").is("excluido_em", null).order("nome")
      .then(({ data }) => setMembros(data ?? []));
  }, [versao]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMensagem("");
    const { data, error } = await supabase.functions.invoke("cadastrar-tecnico", { body: form });
    setSalvando(false);
    if (error) {
      const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return setMensagem(detalhe?.erro ?? error.message);
    }
    if (data?.erro) return setMensagem(data.erro);
    setMensagem(`${form.nome} cadastrado. Passe a ele o e-mail e a senha inicial para entrar no app.`);
    setForm({ ...form, nome: "", email: "", senha: "", matricula: "" });
    recarregar();
  }

  async function atualizar(m: Membro, campos: Partial<Membro>) {
    const { error } = await supabase.from("usuarios").update(campos).eq("id", m.id);
    if (error) return alert(error.message);
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2";

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Equipe</h2>
      <form onSubmit={cadastrar} className="grid gap-2 border-b border-gray-100 p-4 sm:grid-cols-3">
        <input className={campo} placeholder="Nome completo (sai na foto)" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className={campo} placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className={campo} placeholder="Senha inicial (mín. 8)" minLength={8} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
        <input className={campo} placeholder="Cargo (sai na foto)" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
        <input className={campo} placeholder="Matrícula (opcional)" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
        <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={salvando}>
          {salvando ? "Cadastrando..." : "Cadastrar técnico"}
        </button>
        {mensagem && <p className="text-sm text-gray-700 sm:col-span-3">{mensagem}</p>}
      </form>
      <ul>
        {membros.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 text-sm last:border-0">
            <span className={`font-medium ${m.ativo ? "" : "text-gray-400 line-through"}`}>{m.nome}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{m.papel}</span>
            <input className="rounded border border-gray-200 px-2 py-1" defaultValue={m.cargo ?? ""} placeholder="Cargo"
              onBlur={(e) => e.target.value !== (m.cargo ?? "") && atualizar(m, { cargo: e.target.value || null })} />
            <input className="w-36 rounded border border-gray-200 px-2 py-1" defaultValue={m.documento ?? ""} placeholder="CPF ou RG" title="Sai na O.S. de apresentação (abordagem policial)"
              onBlur={(e) => e.target.value !== (m.documento ?? "") && atualizar(m, { documento: e.target.value.trim() || null })} />
            {m.papel === "tecnico" && (
              <label className="flex items-center gap-1 text-gray-600">
                Seg–Qui
                <input type="time" className="rounded border border-gray-200 px-1 py-1" defaultValue={m.inicio_jornada.slice(0, 5)} title="Entrada"
                  onBlur={(e) => e.target.value && e.target.value !== m.inicio_jornada.slice(0, 5) && atualizar(m, { inicio_jornada: e.target.value })} />
                às
                <input type="time" className="rounded border border-gray-200 px-1 py-1" defaultValue={m.fim_jornada.slice(0, 5)} title="Saída de segunda a quinta"
                  onBlur={(e) => e.target.value && e.target.value !== m.fim_jornada.slice(0, 5) && atualizar(m, { fim_jornada: e.target.value })} />
                · Sex até
                <input type="time" className="rounded border border-gray-200 px-1 py-1" defaultValue={m.fim_jornada_sexta.slice(0, 5)} title="Saída na sexta"
                  onBlur={(e) => e.target.value && e.target.value !== m.fim_jornada_sexta.slice(0, 5) && atualizar(m, { fim_jornada_sexta: e.target.value })} />
              </label>
            )}
            {m.papel === "tecnico" && (
              <select className="rounded border border-gray-200 px-2 py-1" value={m.regime_horas}
                onChange={(e) => atualizar(m, { regime_horas: e.target.value as Membro["regime_horas"] })}>
                <option value="hora_extra">Hora extra</option>
                <option value="banco_horas">Banco de horas</option>
              </select>
            )}
            {m.papel === "tecnico" && (
              <button className="ml-auto text-gray-600 hover:underline" onClick={() => atualizar(m, { ativo: !m.ativo })}>
                {m.ativo ? "Desativar" : "Reativar"}
              </button>
            )}
            {m.papel === "tecnico" && (
              <button className="text-red-700 hover:underline" onClick={() => setExcluir(m)}>Excluir</button>
            )}
          </li>
        ))}
      </ul>
      {excluir && <ExcluirDados tipo="tecnico" id={excluir.id} nome={excluir.nome} fechar={() => setExcluir(null)} aoExcluir={recarregar} />}
    </section>
  );
}
