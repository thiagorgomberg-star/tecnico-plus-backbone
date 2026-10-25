"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import Almoxarifado from "@/componentes/Almoxarifado";
import Analise from "@/componentes/Analise";
import Avisos from "@/componentes/Avisos";
import AtividadesPreventiva from "@/componentes/AtividadesPreventiva";
import CaixasRede from "@/componentes/CaixasRede";
import Catalogo from "@/componentes/Catalogo";
import ConfigEmpresa from "@/componentes/ConfigEmpresa";
import ConsoleDespacho from "@/componentes/ConsoleDespacho";
import Horas from "@/componentes/Horas";
import Indicadores from "@/componentes/Indicadores";
import Equipe from "@/componentes/Equipe";
import Despesas from "@/componentes/Despesas";
import Escala from "@/componentes/Escala";
import Ferramental from "@/componentes/Ferramental";
import Frota from "@/componentes/Frota";
import Login from "@/componentes/Login";
import OrdensServico from "@/componentes/OrdensServico";
import RotasEventos from "@/componentes/RotasEventos";
import TecnicosAoVivo from "@/componentes/TecnicosAoVivo";
import VistoriaMG from "@/componentes/VistoriaMG";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Perfil = { nome: string; papel: string };

type AbaPainel = "os" | "campo" | "escala" | "rotas" | "equipe" | "catalogo" | "almoxarifado" | "caixas" | "indicadores" | "despesas" | "horas" | "analise" | "console" | "ferramental" | "config" | "frota" | "vistoria";

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

// Menu lateral agrupado (padrão Oracle Field Service: console de despacho primeiro).
const GRUPOS: [string, [AbaPainel, string][]][] = [
  ["Operação", [
    ["console", "Console de despacho"],
    ["os", "Ordens de serviço"],
    ["campo", "Equipe em campo"],
    ["escala", "Escala"],
    ["equipe", "Equipe"],
  ]],
  ["Rede", [
    ["caixas", "Caixas e fibras"],
    ["rotas", "Rotas e eventos"],
    ["vistoria", "Vistoria Backbone MG"],
  ]],
  ["Gestão", [
    ["indicadores", "Indicadores"],
    ["analise", "Análise (BI)"],
    ["horas", "Horas"],
    ["frota", "Frota"],
    ["despesas", "Despesas"],
  ]],
  ["Materiais", [
    ["catalogo", "Serviços e materiais"],
    ["almoxarifado", "Almoxarifado"],
    ["ferramental", "Ferramental e EPI"],
  ]],
  ["Sistema", [
    ["config", "Configurações"],
  ]],
];

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [aba, setAba] = useState<AbaPainel>("console");
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "grafite" : lerTema()));
  const cor = TEMAS[tema];
  // Menu lateral: no computador fica aberto (lembra a escolha); no celular abre por cima e fecha ao escolher.
  const [menuAberto, setMenuAberto] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 1024) return false;
    try { return localStorage.getItem("menu-painel") !== "fechado"; } catch { return true; }
  });
  const alternarMenu = () => setMenuAberto((a) => {
    try { if (window.innerWidth >= 1024) localStorage.setItem("menu-painel", a ? "fechado" : "aberto"); } catch {}
    return !a;
  });
  const escolher = (a: AbaPainel) => {
    setAba(a);
    if (window.innerWidth < 1024) setMenuAberto(false);
  };

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
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <button onClick={alternarMenu} aria-label={menuAberto ? "Recolher menu" : "Abrir menu"} title={menuAberto ? "Recolher menu" : "Abrir menu"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg>
          </button>
          <h1 className="truncate text-lg font-semibold tracking-wide">Técnico Plus <span className="hidden font-normal text-[#D5D1CD] sm:inline">| Backbone</span></h1>
          <div className="ml-auto flex items-center gap-3 text-sm text-[#D5D1CD]">
            {sessao && <Avisos usuarioId={sessao.user.id} />}
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/40" style={{ background: cor.destaque }}>
              {(perfil?.nome ?? "S").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </span>
            <span className="hidden sm:inline">{perfil?.nome}</span>
            <button className="text-white/80 hover:text-white hover:underline" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </div>
      </header>
      <div className="relative flex flex-1">
        {menuAberto && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuAberto(false)} />}
        <nav className={`${menuAberto ? "translate-x-0" : "-translate-x-full lg:hidden"} fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white py-3 shadow-lg transition-transform lg:sticky lg:top-0 lg:h-screen lg:shadow-none`}>
          <div className="mb-2 flex items-center justify-between px-4 lg:hidden">
            <span className="font-semibold text-[#161513]">Menu</span>
            <button onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="text-2xl leading-none text-gray-500">×</button>
          </div>
          {GRUPOS.map(([grupo, itens]) => (
            <div key={grupo} className="mb-2">
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{grupo}</p>
              {itens.map(([valor, rotulo]) => (
                <button key={valor} onClick={() => escolher(valor)}
                  style={aba === valor ? { borderColor: cor.destaque, color: cor.destaque, background: `${cor.destaque}12` } : undefined}
                  className={`block w-full border-l-[3px] px-4 py-2 text-left text-sm ${aba === valor ? "font-semibold" : "border-transparent text-gray-700 hover:bg-gray-50"}`}>
                  {rotulo}
                </button>
              ))}
            </div>
          ))}
        </nav>
      <main className={`mx-auto w-full min-w-0 flex-1 p-4 sm:p-6 ${["console", "analise", "campo"].includes(aba) ? "max-w-none" : "max-w-6xl"}`}>
        {aba === "console" ? <ConsoleDespacho tecnicos={tecnicos} /> : aba === "os" ? <OrdensServico tecnicos={tecnicos} /> : aba === "campo" ? <TecnicosAoVivo /> : aba === "escala" ? <Escala tecnicos={tecnicos} /> : aba === "equipe" ? <Equipe aoMudar={equipeMudou} /> : aba === "catalogo" ? <><Catalogo /><AtividadesPreventiva /></> : aba === "almoxarifado" ? <Almoxarifado tecnicos={tecnicos} /> : aba === "caixas" ? <CaixasRede /> : aba === "vistoria" ? <VistoriaMG /> : aba === "indicadores" ? <Indicadores /> : aba === "despesas" ? <Despesas tecnicos={tecnicos} /> : aba === "horas" ? <Horas /> : aba === "analise" ? <Analise /> : aba === "ferramental" ? <Ferramental tecnicos={tecnicos} /> : aba === "frota" ? <Frota tecnicos={tecnicos} /> : aba === "config" ? (
          <div className="grid gap-6"><ConfigEmpresa /><section className="max-w-md rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-lg font-semibold">Configurações</h2>
            <p className="mb-4 text-sm text-gray-500">Cor do painel (fica salva neste navegador).</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(TEMAS) as Tema[]).map((t) => (
                <button key={t} onClick={() => { setTema(t); try { localStorage.setItem("tema-painel", t); } catch {} }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${tema === t ? "border-blue-600 font-semibold" : "border-gray-200 hover:bg-gray-50"}`}>
                  <span className="h-5 w-5 rounded-full border border-gray-300" style={{ background: TEMAS[t].topo }} />
                  {TEMAS[t].rotulo}
                  {tema === t && <span className="ml-auto text-blue-600">✓</span>}
                </button>
              ))}
            </div>
          </section></div>
        ) : <RotasEventos />}
      </main>
      </div>
    </div>
  );
}
