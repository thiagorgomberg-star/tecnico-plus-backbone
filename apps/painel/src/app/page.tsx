"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import Login from "@/componentes/Login";
import OrdensServico from "@/componentes/OrdensServico";
import TecnicosAoVivo from "@/componentes/TecnicosAoVivo";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Perfil = { nome: string; papel: string };

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [aba, setAba] = useState<"os" | "campo">("os");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) return;
    supabase.from("usuarios").select("nome, papel").eq("id", sessao.user.id).single()
      .then(({ data }) => setPerfil(data));
    supabase.from("usuarios").select("id, nome").eq("papel", "tecnico").eq("ativo", true).order("nome")
      .then(({ data }) => setTecnicos(data ?? []));
  }, [sessao]);

  if (sessao === undefined) return null;
  if (!sessao) return <Login />;

  if (perfil && perfil.papel === "tecnico") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p>Este painel é só para supervisores. Técnicos usam o app no celular.</p>
        <button className="text-blue-700 hover:underline" onClick={() => supabase.auth.signOut()}>Sair</button>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold">Técnico Plus</h1>
        <nav className="flex gap-1">
          <button onClick={() => setAba("os")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "os" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Ordens de serviço</button>
          <button onClick={() => setAba("campo")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "campo" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Equipe em campo</button>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-gray-600">
          {perfil?.nome}
          <button className="text-blue-700 hover:underline" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {aba === "os" ? <OrdensServico tecnicos={tecnicos} /> : <TecnicosAoVivo />}
      </main>
    </div>
  );
}
