"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import Almoxarifado from "@/componentes/Almoxarifado";
import Analise from "@/componentes/Analise";
import Avisos from "@/componentes/Avisos";
import AtividadesPreventiva from "@/componentes/AtividadesPreventiva";
import CaixasRede from "@/componentes/CaixasRede";
import LocalizarRompimento from "@/componentes/LocalizarRompimento";
import AnalisarCurva from "@/componentes/AnalisarCurva";
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
import Icone, { NomeIcone } from "@/componentes/Icone";
import Login from "@/componentes/Login";
import OrdensServico from "@/componentes/OrdensServico";
import Clientes from "@/componentes/Clientes";
import RotasEventos from "@/componentes/RotasEventos";
import TecnicosAoVivo from "@/componentes/TecnicosAoVivo";
import VistoriaMG from "@/componentes/VistoriaMG";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Perfil = { nome: string; papel: string };

type AbaPainel = "clientes" | "curva" | "rompimento" | "os" | "campo" | "escala" | "rotas" | "equipe" | "catalogo" | "almoxarifado" | "caixas" | "indicadores" | "despesas" | "horas" | "analise" | "console" | "ferramental" | "config" | "frota" | "vistoria" | "vistoria_sp";

// Abas na ordem do menu (padrão Oracle Field Service: console de despacho primeiro).
// Cor do painel escolhida pelo supervisor (fica salva no navegador).
// Menu lateral em degradê (mesma identidade do app do técnico); destaque = cor dos botões e do item ativo.
const TEMAS = {
  azul: { rotulo: "Azul-marinho", topo: "#163A6B", topo2: "#0F2747", destaque: "#163A6B", suave: "#9FB3CF" },
  grafite: { rotulo: "Cinza grafite", topo: "#3A3F47", topo2: "#1F2328", destaque: "#2F3A4A", suave: "#A7AFBA" },
  vermelho: { rotulo: "Vermelho", topo: "#B5121B", topo2: "#7A0B11", destaque: "#B5121B", suave: "#F0B4B7" },
};
type Tema = keyof typeof TEMAS;
const lerTema = (): Tema => {
  try {
    const t = localStorage.getItem("tema-painel");
    return t && t in TEMAS ? (t as Tema) : "azul";
  } catch {
    return "azul";
  }
};

// Menu lateral agrupado (padrão Oracle Field Service: console de despacho primeiro).
const GRUPOS: [string, [AbaPainel, string, NomeIcone][]][] = [
  ["Operação", [
    ["console", "Console de despacho", "monitor-dashboard"],
    ["os", "Ordens de serviço", "clipboard-text-outline"],
    ["campo", "Equipe em campo", "map-marker-radius-outline"],
    ["escala", "Escala", "calendar-month-outline"],
    ["equipe", "Equipe", "account-group-outline"],
    ["clientes", "Clientes e SLA", "domain"],
  ]],
  ["Rede", [
    ["caixas", "Caixas e fibras", "package-variant"],
    ["rotas", "Rotas e eventos", "map-outline"],
    ["rompimento", "Localizar rompimento", "map-marker-distance"],
    ["curva", "Analisar curva OTDR", "chart-bell-curve"],
    ["vistoria", "Vistoria Backbone MG", "binoculars"],
    ["vistoria_sp", "Vistoria Backbone SP", "binoculars"],
  ]],
  ["Gestão", [
    ["indicadores", "Indicadores", "chart-box-outline"],
    ["analise", "Análise (BI)", "chart-line"],
    ["horas", "Horas", "clock-outline"],
    ["frota", "Frota", "car-outline"],
    ["despesas", "Despesas", "cash-multiple"],
  ]],
  ["Materiais", [
    ["catalogo", "Serviços e materiais", "format-list-bulleted"],
    ["almoxarifado", "Almoxarifado", "warehouse"],
    ["ferramental", "Ferramental e EPI", "toolbox-outline"],
  ]],
  ["Sistema", [
    ["config", "Configurações", "cog-outline"],
  ]],
];
const TITULOS = Object.fromEntries(GRUPOS.flatMap(([, itens]) => itens.map(([v, r]) => [v, r]))) as Record<AbaPainel, string>;
const dataHoje = () => {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [aba, setAba] = useState<AbaPainel>("console");
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "azul" : lerTema()));
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

  const iniciais = (perfil?.nome ?? "S").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="flex flex-1">
      {menuAberto && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuAberto(false)} />}
      <nav style={{ background: `linear-gradient(180deg, ${cor.topo}, ${cor.topo2})` }}
        className={`${menuAberto ? "translate-x-0" : "-translate-x-full lg:hidden"} fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto px-3 py-4 text-white shadow-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:shadow-none`}>
        <div className="mb-3 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Icone nome="lan-connect" tamanho={21} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-tight">Técnico Plus</p>
            <p className="text-xs" style={{ color: cor.suave }}>Multivale Backbone</p>
          </div>
          <button onClick={alternarMenu} aria-label="Recolher menu" title="Recolher menu" className="rounded-lg p-1 hover:bg-white/10" style={{ color: cor.suave }}>
            <Icone nome="chevron-left" tamanho={20} />
          </button>
        </div>
        {GRUPOS.map(([grupo, itens]) => (
          <div key={grupo} className="mb-1">
            <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: cor.suave }}>{grupo}</p>
            {itens.map(([valor, rotulo, icone]) => (
              <button key={valor} onClick={() => escolher(valor)}
                style={aba === valor ? { color: cor.destaque } : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13.5px] ${aba === valor ? "bg-white font-bold shadow-sm" : "text-white/85 hover:bg-white/10"}`}>
                <span style={aba === valor ? undefined : { color: cor.suave }}><Icone nome={icone} tamanho={18} /></span>
                {rotulo}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold" style={{ color: cor.destaque }}>{iniciais}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{perfil?.nome ?? "Supervisor"}</p>
            <p className="text-xs" style={{ color: cor.suave }}>{perfil?.papel === "admin" ? "Administrador" : "Supervisor"}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} title="Sair" aria-label="Sair" className="rounded-lg p-1.5 hover:bg-white/10" style={{ color: cor.suave }}>
            <Icone nome="logout" tamanho={19} />
          </button>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="barra-topo flex items-center gap-3 px-4 pb-1 pt-4 sm:px-6">
          <button onClick={alternarMenu} aria-label="Abrir menu" title="Abrir menu" style={{ color: cor.destaque }}
            className={`${menuAberto ? "lg:hidden" : ""} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm`}>
            <Icone nome="menu" tamanho={22} />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-[#667085]">{dataHoje()} · {TITULOS[aba]}</p>
            <h1 className="truncate text-xl font-extrabold tracking-tight">{saudacao()}{perfil?.nome ? `, ${perfil.nome.split(/\s+/)[0]}` : ""}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {sessao && <div className="flex h-10 items-center rounded-xl bg-white px-1 shadow-sm"><Avisos usuarioId={sessao.user.id} /></div>}
          </div>
        </header>
      <main className={`mx-auto w-full min-w-0 flex-1 px-4 pb-6 pt-3 sm:px-6 ${["console", "analise", "campo"].includes(aba) ? "max-w-none" : "max-w-6xl"}`}>
        {aba === "console" ? <ConsoleDespacho tecnicos={tecnicos} /> : aba === "os" ? <OrdensServico tecnicos={tecnicos} /> : aba === "campo" ? <TecnicosAoVivo /> : aba === "escala" ? <Escala tecnicos={tecnicos} /> : aba === "equipe" ? <Equipe aoMudar={equipeMudou} /> : aba === "clientes" ? <Clientes /> : aba === "catalogo" ? <><Catalogo /><AtividadesPreventiva /></> : aba === "almoxarifado" ? <Almoxarifado tecnicos={tecnicos} /> : aba === "caixas" ? <CaixasRede /> : aba === "rompimento" ? <LocalizarRompimento /> : aba === "curva" ? <AnalisarCurva /> : aba === "vistoria" ? <VistoriaMG key="MG" regiao="MG" /> : aba === "vistoria_sp" ? <VistoriaMG key="SP" regiao="SP" /> : aba === "indicadores" ? <Indicadores /> : aba === "despesas" ? <Despesas tecnicos={tecnicos} /> : aba === "horas" ? <Horas /> : aba === "analise" ? <Analise /> : aba === "ferramental" ? <Ferramental tecnicos={tecnicos} /> : aba === "frota" ? <Frota tecnicos={tecnicos} /> : aba === "config" ? (
          <div className="grid gap-6"><ConfigEmpresa /><section className="max-w-md rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-lg font-semibold">Configurações</h2>
            <p className="mb-4 text-sm text-gray-500">Cor do painel (fica salva neste navegador).</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(TEMAS) as Tema[]).map((t) => (
                <button key={t} onClick={() => { setTema(t); try { localStorage.setItem("tema-painel", t); } catch {} }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${tema === t ? "border-[#163A6B] font-semibold" : "border-gray-200 hover:bg-gray-50"}`}>
                  <span className="h-5 w-5 rounded-full border border-gray-300" style={{ background: TEMAS[t].topo }} />
                  {TEMAS[t].rotulo}
                  {tema === t && <span className="ml-auto text-[#163A6B]">✓</span>}
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
