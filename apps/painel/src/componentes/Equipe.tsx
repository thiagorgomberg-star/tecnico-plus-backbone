"use client";

import { useCallback, useEffect, useState } from "react";

import ExcluirDados from "@/componentes/ExcluirDados";
import FichaTecnico from "@/componentes/FichaTecnico";
import { supabase } from "@/lib/supabase";

type Membro = {
  id: string; nome: string; cargo: string | null; matricula: string | null; documento: string | null; papel: string; ativo: boolean; tecnico_responsavel_id: string | null;
  inicio_jornada: string; fim_jornada: string; fim_jornada_sexta: string; regime_horas: "hora_extra" | "banco_horas";
};

export default function Equipe({ aoMudar }: { aoMudar: () => void }) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [form, setForm] = useState({ papel: "tecnico", tecnico_responsavel_id: "", nome: "", email: "", senha: "", cargo: "Técnico de Backbone", matricula: "" });
  const auxiliarForm = form.papel === "auxiliar";
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [versao, setVersao] = useState(0);
  const [excluir, setExcluir] = useState<Membro | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const recarregar = useCallback(() => { setVersao((v) => v + 1); aoMudar(); }, [aoMudar]);

  useEffect(() => {
    supabase.from("usuarios").select("id, nome, cargo, matricula, documento, papel, ativo, tecnico_responsavel_id, inicio_jornada, fim_jornada, fim_jornada_sexta, regime_horas").is("excluido_em", null).order("nome")
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
    setMensagem(auxiliarForm && !form.email
      ? `${form.nome} cadastrado como auxiliar (sem acesso ao app).`
      : `${form.nome} cadastrado. Passe o e-mail e a senha inicial para entrar no app.`);
    setForm({ ...form, nome: "", email: "", senha: "", matricula: "", tecnico_responsavel_id: "" });
    recarregar();
  }

  async function atualizar(m: Membro, campos: Partial<Membro>) {
    const { error } = await supabase.from("usuarios").update(campos).eq("id", m.id);
    if (error) return alert(error.message);
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2";
  const tecnicos = membros.filter((m) => m.papel === "tecnico" && m.ativo);
  const auxiliaresDe = (id: string) => membros.filter((m) => m.papel === "auxiliar" && m.ativo && m.tecnico_responsavel_id === id).map((m) => m.nome);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Equipe</h2>
      <form onSubmit={cadastrar} className="grid gap-2 border-b border-gray-100 p-4 sm:grid-cols-3">
        <select className={campo} value={form.papel}
          onChange={(e) => setForm({ ...form, papel: e.target.value, cargo: e.target.value === "auxiliar" ? "Auxiliar técnico" : "Técnico de Backbone" })}>
          <option value="tecnico">Técnico</option>
          <option value="auxiliar">Auxiliar</option>
        </select>
        {auxiliarForm && (
          <select className={campo} value={form.tecnico_responsavel_id} onChange={(e) => setForm({ ...form, tecnico_responsavel_id: e.target.value })} required>
            <option value="">Trabalha com qual técnico?</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        )}
        <input className={campo} placeholder="Nome completo (sai na foto)" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className={campo} placeholder={auxiliarForm ? "E-mail (só se for usar o app)" : "E-mail"} type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} required={!auxiliarForm} />
        <input className={campo} placeholder="Senha inicial (mín. 8)" minLength={8} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })}
          required={!auxiliarForm || !!form.email} />
        <input className={campo} placeholder="Cargo (sai na foto)" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
        <input className={campo} placeholder="Matrícula (opcional)" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
        <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={salvando}>
          {salvando ? "Cadastrando..." : auxiliarForm ? "Cadastrar auxiliar" : "Cadastrar técnico"}
        </button>
        {mensagem && <p className="text-sm text-gray-700 sm:col-span-3">{mensagem}</p>}
      </form>
      <ul>
        {membros.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 text-sm last:border-0">
            <button title="Abrir a ficha completa" onClick={() => setFicha(m.id)}
              className={`font-medium text-blue-700 hover:underline ${m.ativo ? "" : "text-gray-400 line-through"}`}>{m.nome}</button>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{m.papel}</span>
            <input className="rounded border border-gray-200 px-2 py-1" defaultValue={m.cargo ?? ""} placeholder="Cargo"
              onBlur={(e) => e.target.value !== (m.cargo ?? "") && atualizar(m, { cargo: e.target.value || null })} />
            {m.papel === "auxiliar" && (
              <label className="flex items-center gap-1 text-gray-600">
                Trabalha com
                <select className="rounded border border-gray-200 px-2 py-1" value={m.tecnico_responsavel_id ?? ""}
                  onChange={(e) => atualizar(m, { tecnico_responsavel_id: e.target.value || null })}>
                  <option value="">— nenhum —</option>
                  {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
            )}
            {m.papel === "tecnico" && auxiliaresDe(m.id).length > 0 && (
              <span className="text-xs text-gray-500">Auxiliar: {auxiliaresDe(m.id).join(", ")}</span>
            )}
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
            {["tecnico", "auxiliar"].includes(m.papel) && (
              <button className="ml-auto text-gray-600 hover:underline" onClick={() => atualizar(m, { ativo: !m.ativo })}>
                {m.ativo ? "Desativar" : "Reativar"}
              </button>
            )}
            {["tecnico", "auxiliar"].includes(m.papel) && (
              <button className="text-red-700 hover:underline" onClick={() => setExcluir(m)}>Excluir</button>
            )}
          </li>
        ))}
      </ul>
      {ficha && <FichaTecnico id={ficha} fechar={() => setFicha(null)} aoSalvar={recarregar} />}
      {excluir && <ExcluirDados tipo="tecnico" id={excluir.id} nome={excluir.nome} fechar={() => setExcluir(null)} aoExcluir={recarregar} />}
    </section>
  );
}
