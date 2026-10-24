"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import Almoxarifado from "@/componentes/Almoxarifado";
import Analise from "@/componentes/Analise";
import Avisos from "@/componentes/Avisos";
import AtividadesPreventiva from "@/componentes/AtividadesPreventiva";
import CaixasRede from "@/componentes/CaixasRede";
import Catalogo from "@/componentes/Catalogo";
import ConsoleDespacho from "@/componentes/ConsoleDespacho";
import Horas from "@/componentes/Horas";
import Indicadores from "@/componentes/Indicadores";
import Equipe from "@/componentes/Equipe";
import Despesas from "@/componentes/Despesas";
import Escala from "@/componentes/Escala";
import Ferramental from "@/componentes/Ferramental";
import Login from "@/componentes/Login";
import OrdensServico from "@/componentes/OrdensServico";
import RotasEventos from "@/componentes/RotasEventos";
import TecnicosAoVivo from "@/componentes/TecnicosAoVivo";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Perfil = { nome: string; papel: string };

type AbaPainel = "os" | "campo" | "escala" | "rotas" | "equipe" | "catalogo" | "almoxarifado" | "caixas" | "indicadores" | "despesas" | "horas" | "analise" | "console" | "ferramental";

// Abas na ordem do menu (padrão Oracle Field Service: console de despacho primeiro).
// Cor do painel escolhida pelo supervisor (fica salva no navegador).
const TEMAS = {
  grafite: { rotulo: "Cinza grafite", topo: "#312D2A", destaque: "#0572CE" },
  azul: { rotulo: "Azul", topo: "#0B3C6E", destaque: "#0572CE" },
  vermelho: { rotulo: "Vermelho", topo: "#B5121B", destaque: "#B5121B" },
};
type Tema = keyof typeof TEMAS;
const lerTema = (): Tema => {
  try {
    const t = localStorage.getItem("tema-painel");
    return t && t in TEMAS ? (t as Tema) : "grafite";
  } catch {
    return "grafite";
  }
};

const ABAS: [AbaPainel, string][] = [
  ["console", "Console de despacho"],
  ["os", "Ordens de serviço"],
  ["indicadores", "Indicadores"],
  ["analise", "Análise (BI)"],
  ["campo", "Equipe em campo"],
  ["escala", "Escala"],
  ["equipe", "Equipe"],
  ["caixas", "Caixas e fibras"],
  ["rotas", "Rotas e eventos"],
  ["catalogo", "Serviços e materiais"],
  ["horas", "Horas"],
  ["despesas", "Despesas"],
  ["almoxarifado", "Almoxarifado"],
  ["ferramental", "Ferramental e EPI"],
];

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [aba, setAba] = useState<AbaPainel>("console");
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "grafite" : lerTema()));
  const cor = TEMAS[tema];

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
      <header className="text-white" style={{ background: cor.topo }}>
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <h1 className="text-lg font-semibold tracking-wide">Técnico Plus <span className="font-normal text-[#D5D1CD]">| Backbone</span></h1>
          <div className="ml-auto flex items-center gap-3 text-sm text-[#D5D1CD]">
            <div className="flex items-center gap-1" title="Cor do painel">
              {(Object.keys(TEMAS) as Tema[]).map((t) => (
                <button key={t} aria-label={`Cor ${TEMAS[t].rotulo}`} title={TEMAS[t].rotulo}
                  onClick={() => { setTema(t); try { localStorage.setItem("tema-painel", t); } catch {} }}
                  className={`h-4 w-4 rounded-full border-2 ${tema === t ? "border-white" : "border-white/30"}`} style={{ background: TEMAS[t].topo }} />
              ))}
            </div>
            {sessao && <Avisos usuarioId={sessao.user.id} />}
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/40" style={{ background: cor.destaque }}>
              {(perfil?.nome ?? "S").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </span>
            <span className="hidden sm:inline">{perfil?.nome}</span>
            <button className="text-white/80 hover:text-white hover:underline" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-1 bg-white px-2 text-[#161513] shadow-sm sm:px-4">
          {ABAS.map(([valor, rotulo]) => (
            <button key={valor} onClick={() => setAba(valor)}
              style={aba === valor ? { borderColor: cor.destaque, color: cor.destaque } : undefined}
              className={`border-b-[3px] px-3 py-2.5 text-sm ${aba === valor ? "font-semibold" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              {rotulo}
            </button>
          ))}
        </nav>
      </header>
      <main className={`mx-auto w-full flex-1 p-4 sm:p-6 ${["console", "analise", "campo"].includes(aba) ? "max-w-none" : "max-w-6xl"}`}>
        {aba === "console" ? <ConsoleDespacho tecnicos={tecnicos} /> : aba === "os" ? <OrdensServico tecnicos={tecnicos} /> : aba === "campo" ? <TecnicosAoVivo /> : aba === "escala" ? <Escala tecnicos={tecnicos} /> : aba === "equipe" ? <Equipe aoMudar={equipeMudou} /> : aba === "catalogo" ? <><Catalogo /><AtividadesPreventiva /></> : aba === "almoxarifado" ? <Almoxarifado tecnicos={tecnicos} /> : aba === "caixas" ? <CaixasRede /> : aba === "indicadores" ? <Indicadores /> : aba === "despesas" ? <Despesas tecnicos={tecnicos} /> : aba === "horas" ? <Horas /> : aba === "analise" ? <Analise /> : aba === "ferramental" ? <Ferramental tecnicos={tecnicos} /> : <RotasEventos />}
      </main>
    </div>
  );
}
