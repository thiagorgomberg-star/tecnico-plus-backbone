"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import Almoxarifado from "@/componentes/Almoxarifado";
import Analise from "@/componentes/Analise";
import Avisos from "@/componentes/Avisos";
import AtividadesPreventiva from "@/componentes/AtividadesPreventiva";
import CaixasRede from "@/componentes/CaixasRede";
import Catalogo from "@/componentes/Catalogo";
import Horas from "@/componentes/Horas";
import Indicadores from "@/componentes/Indicadores";
import Equipe from "@/componentes/Equipe";
import Despesas from "@/componentes/Despesas";
import Escala from "@/componentes/Escala";
import Login from "@/componentes/Login";
import OrdensServico from "@/componentes/OrdensServico";
import RotasEventos from "@/componentes/RotasEventos";
import TecnicosAoVivo from "@/componentes/TecnicosAoVivo";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Perfil = { nome: string; papel: string };

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [aba, setAba] = useState<"os" | "campo" | "escala" | "rotas" | "equipe" | "catalogo" | "almoxarifado" | "caixas" | "indicadores" | "despesas" | "horas" | "analise">("os");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const [versaoEquipe, setVersaoEquipe] = useState(0);
  const equipeMudou = useCallback(() => setVersaoEquipe((v) => v + 1), []);

  useEffect(() => {
    if (!sessao) return;
    supabase.from("usuarios").select("nome, papel").eq("id", sessao.user.id).single()
      .then(({ data }) => setPerfil(data));
    supabase.from("usuarios").select("id, nome").eq("papel", "tecnico").eq("ativo", true).order("nome")
      .then(({ data }) => setTecnicos(data ?? []));
  }, [sessao, versaoEquipe]);

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
        <nav className="flex flex-wrap gap-1">
          <button onClick={() => setAba("os")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "os" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Ordens de serviço</button>
          <button onClick={() => setAba("indicadores")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "indicadores" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Indicadores</button>
          <button onClick={() => setAba("analise")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "analise" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Análise (BI)</button>
          <button onClick={() => setAba("campo")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "campo" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Equipe em campo</button>
          <button onClick={() => setAba("escala")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "escala" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Escala</button>
          <button onClick={() => setAba("equipe")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "equipe" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Equipe</button>
          <button onClick={() => setAba("caixas")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "caixas" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Caixas e fibras</button>
          <button onClick={() => setAba("rotas")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "rotas" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Rotas e eventos</button>
          <button onClick={() => setAba("catalogo")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "catalogo" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Serviços e materiais</button>
          <button onClick={() => setAba("horas")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "horas" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Horas</button>
          <button onClick={() => setAba("despesas")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "despesas" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Despesas</button>
          <button onClick={() => setAba("almoxarifado")}
            className={`rounded-md px-3 py-1.5 text-sm ${aba === "almoxarifado" ? "bg-gray-100 font-medium" : "text-gray-600"}`}>Almoxarifado</button>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-gray-600">
          {sessao && <Avisos usuarioId={sessao.user.id} />}
          {perfil?.nome}
          <button className="text-blue-700 hover:underline" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {aba === "os" ? <OrdensServico tecnicos={tecnicos} /> : aba === "campo" ? <TecnicosAoVivo /> : aba === "escala" ? <Escala tecnicos={tecnicos} /> : aba === "equipe" ? <Equipe aoMudar={equipeMudou} /> : aba === "catalogo" ? <><Catalogo /><AtividadesPreventiva /></> : aba === "almoxarifado" ? <Almoxarifado tecnicos={tecnicos} /> : aba === "caixas" ? <CaixasRede /> : aba === "indicadores" ? <Indicadores /> : aba === "despesas" ? <Despesas tecnicos={tecnicos} /> : aba === "horas" ? <Horas /> : aba === "analise" ? <Analise /> : <RotasEventos />}
      </main>
    </div>
  );
}
