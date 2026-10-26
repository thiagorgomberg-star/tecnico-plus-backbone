"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DetalheOS from "@/componentes/DetalheOS";
import { abrirInfoNoMapa, alvoDoPonto } from "@/lib/aoVivo";
import { atualizarGeocarAgora } from "@/lib/geocar";
import { supabase } from "@/lib/supabase";
import { OrdemServico, rotuloStatus, StatusOS, Tecnico } from "@/lib/tipos";

type OsConsole = OrdemServico & {
  programada_inicio: string | null; programada_fim: string | null;
  criado_em: string; aceita_em: string | null; iniciada_em: string | null; latitude: number | null; longitude: number | null;
};
type Intervalo = { tecnico_id: string; inicio: string; fim: string | null };
type Posicao = { tecnico_id: string; nome: string; latitude: number | null; longitude: number | null; registrado_em: string };
type Carro = { viat_id: number; matricula: string; latitude: number | null; longitude: number | null; datahora: string | null; veiculos: { tecnico_id: string | null } | null };
type Fonte = "celular" | "veiculo";

// Cores por status (com o nome do status escrito na barra e na legenda, nunca só a cor).
const COR: Record<StatusOS, { fundo: string; texto: string }> = {
  rascunho: { fundo: "#d1d5db", texto: "#1f2937" },
  enviada: { fundo: "#93c5fd", texto: "#0c2d5e" },
  aceita: { fundo: "#60a5fa", texto: "#0c2d5e" },
  em_execucao: { fundo: "#86d26b", texto: "#173b0c" },
  pausada: { fundo: "#fcd34d", texto: "#5b3a00" },
  concluida: { fundo: "#c4b5fd", texto: "#2e1065" },
  devolvida: { fundo: "#fca5a5", texto: "#5f0f0f" },
  baixada: { fundo: "#d6d3d1", texto: "#292524" },
  cancelada: { fundo: "#e5e7eb", texto: "#6b7280" },
};
const H_INICIO = 6, H_FIM = 22;
const CENTRO_INICIAL: [number, number] = [-45.5, -23.0];
const ABERTAS: StatusOS[] = ["rascunho", "enviada", "aceita", "em_execucao", "pausada", "devolvida"];
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

// Console de despacho (padrão Oracle Field Service): mapa, linha do tempo por técnico e O.S. não atribuídas.
export default function ConsoleDespacho({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [dia, setDia] = useState(() => isoDia(new Date()));
  const [ordens, setOrdens] = useState<OsConsole[]>([]);
  const [expedientes, setExpedientes] = useState<Intervalo[]>([]);
  const [refeicoes, setRefeicoes] = useState<Intervalo[]>([]);
  const [posicoes, setPosicoes] = useState<Posicao[]>([]);
  const [carros, setCarros] = useState<Carro[]>([]);
  const [fonte, setFonte] = useState<Fonte>("celular");
  const [atualizando, setAtualizando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [busca, setBusca] = useState("");
  const [agora, setAgora] = useState(0);
  const [detalhe, setDetalhe] = useState<OsConsole | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const divMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const [mapaPronto, setMapaPronto] = useState(false);

  const inicioDia = useMemo(() => new Date(`${dia}T00:00:00`), [dia]);
  const fimDia = useMemo(() => new Date(inicioDia.getTime() + 86400000), [inicioDia]);

  const carregar = useCallback(() => {
    const ini = inicioDia.toISOString(), fim = fimDia.toISOString();
    const semana = new Date(inicioDia.getTime() - 7 * 86400000).toISOString();
    supabase.from("console_despacho_os").select("*").or(`status.in.(${ABERTAS.join(",")}),concluida_em.gte.${semana}`).lt("criado_em", fim).limit(2000)
      .then(({ data }) => { setOrdens((data as OsConsole[]) ?? []); setAgora(Date.now()); });
    supabase.from("expedientes").select("tecnico_id, inicio, fim").lt("inicio", fim).or(`fim.is.null,fim.gt.${ini}`)
      .then(({ data }) => setExpedientes(data ?? []));
    supabase.from("refeicoes").select("tecnico_id, inicio, fim").lt("inicio", fim).or(`fim.is.null,fim.gt.${ini}`)
      .then(({ data }) => setRefeicoes(data ?? []));
    supabase.from("posicao_atual_tecnicos").select("tecnico_id, nome, latitude, longitude, registrado_em")
      .then(({ data }) => { setPosicoes(data ?? []); setAtualizadoEm(new Date()); });
    supabase.from("geocar_viaturas").select("viat_id, matricula, latitude, longitude, datahora, veiculos(tecnico_id)")
      .then(({ data }) => setCarros(((data as unknown as Carro[]) ?? []).filter((c) => c.veiculos?.tecnico_id)));
  }, [inicioDia, fimDia]);

  // Botão Atualizar: busca os carros na GEOCAR na hora e recarrega tudo.
  async function forcarAtualizacao() {
    setAtualizando(true);
    try {
      await atualizarGeocarAgora();
    } finally {
      carregar();
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
    const relogio = setInterval(carregar, 60000);
    let agrupador: ReturnType<typeof setTimeout> | null = null;
    const emBreve = () => { if (!agrupador) agrupador = setTimeout(() => { agrupador = null; carregar(); }, 2000); };
    const canal = supabase.channel("console-despacho")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, emBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "expedientes" }, emBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "refeicoes" }, emBreve)
      .subscribe();
    return () => { clearInterval(relogio); if (agrupador) clearTimeout(agrupador); supabase.removeChannel(canal); };
  }, [carregar]);

  const ehHoje = dia === isoDia(new Date(agora || inicioDia.getTime()));
  const escala = (t: number) => {
    const h = (t - inicioDia.getTime()) / 3600000;
    return Math.max(0, Math.min(100, ((h - H_INICIO) / (H_FIM - H_INICIO)) * 100));
  };

  // Barras do dia: executada (início → fim), em andamento (até agora), programada pelo supervisor
  // (horário arrastado na linha do tempo) ou planejada (envio → limite do SLA).
  const barras = useMemo(() => {
    const ini = inicioDia.getTime(), fim = fimDia.getTime();
    // Backlog programado para um técnico também aparece na linha dele (vai para o técnico às 06h do dia).
    return ordens.filter((o) => o.tecnico_id && (o.status !== "rascunho" || o.programada_inicio)).map((o) => {
      const aberta = ABERTAS.includes(o.status);
      const planejada = aberta && !o.iniciada_em;
      const programada = planejada && !!o.programada_inicio;
      const comeco = new Date((programada ? o.programada_inicio : null) ?? o.iniciada_em ?? o.enviada_em ?? o.criado_em).getTime();
      let termino = programada ? (o.programada_fim ? new Date(o.programada_fim).getTime() : comeco + 60 * 60000)
        : o.concluida_em ? new Date(o.concluida_em).getTime()
        : o.iniciada_em ? Math.max(agora, comeco + 15 * 60000)
        : o.sla_limite ? new Date(o.sla_limite).getTime() : comeco + 60 * 60000;
      termino = Math.max(termino, comeco + 15 * 60000);
      return { os: o, comeco, termino, planejada, programada };
    }).filter((b) => b.comeco < fim && b.termino > ini);
  }, [ordens, inicioDia, fimDia, agora]);

  const naoAtribuidas = useMemo(() => ordens.filter((o) => (o.status === "rascunho" && !(o.tecnico_id && o.programada_inicio)) || (!o.tecnico_id && ABERTAS.includes(o.status)))
    .sort((a, b) => (a.sla_limite ?? a.criado_em).localeCompare(b.sla_limite ?? b.criado_em)), [ordens]);

  const linhas = useMemo(() => tecnicos.filter((t) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase())).map((t) => {
    const minhas = barras.filter((b) => b.os.tecnico_id === t.id);
    return {
      t, barras: minhas,
      expedientes: expedientes.filter((e) => e.tecnico_id === t.id),
      refeicoes: refeicoes.filter((r) => r.tecnico_id === t.id),
      abertas: ordens.filter((o) => o.tecnico_id === t.id && ABERTAS.includes(o.status) && o.status !== "rascunho").length,
      emCampo: expedientes.some((e) => e.tecnico_id === t.id && !e.fim),
    };
  }), [tecnicos, busca, barras, expedientes, refeicoes, ordens]);

  // Despacha/transfere e, se veio de um arraste na linha do tempo, já programa o horário.
  async function despachar(osId: string, tecnicoId: string, horario?: { inicio: number; fim: number }) {
    const os = ordens.find((o) => o.id === osId);
    const tec = tecnicos.find((t) => t.id === tecnicoId);
    if (!os || !tec || os.tecnico_id === tecnicoId) return;
    // Dia futuro: a O.S. do backlog fica programada e só vai para o técnico às 06h daquele dia.
    const amanha = new Date(); amanha.setHours(24, 0, 0, 0);
    const futura = os.status === "rascunho" && !!horario && horario.inicio >= amanha.getTime();
    const acao = futura ? "Programar" : os.status === "rascunho" ? "Despachar" : "Transferir";
    const quando = horario ? `${futura ? ` em ${new Date(horario.inicio).toLocaleDateString("pt-BR")}` : ""} às ${hm(new Date(horario.inicio).toISOString())}` : "";
    if (!confirm(`${acao} a O.S. ${os.numero} (${os.titulo}) para ${tec.nome}${quando}?${futura ? "\n\nEla vai para o técnico às 06h desse dia." : ""}`)) return;
    const campos: Record<string, unknown> = { tecnico_id: tecnicoId };
    if (horario) Object.assign(campos, { programada_inicio: new Date(horario.inicio).toISOString(), programada_fim: new Date(horario.fim).toISOString() });
    if (os.status === "rascunho" && !futura) campos.status = "enviada";
    const { error } = await supabase.from("ordens_servico").update(campos).eq("id", osId);
    if (error) return alert(error.message);
    carregar();
  }

  // Arrastar a barra de uma O.S. ainda não iniciada: para os lados muda o horário, para outra linha transfere,
  // e a borda direita muda a duração. Passos de 15 min.
  const PASSO = 15 * 60000;
  const [mover, setMover] = useState<{
    osId: string; modo: "mover" | "fim"; x0: number; y0: number; largura: number;
    comeco: number; termino: number; delta: number; tecnicoId: string;
  } | null>(null);
  const arrastou = useRef(false);
  const msPorPx = (largura: number) => ((H_FIM - H_INICIO) * 3600000) / largura;
  // Horário (em passos de 15 min) no ponto x do trilho de uma linha.
  const horaNoPonto = (clientX: number, trilho: Element) => {
    const ret = trilho.getBoundingClientRect();
    const t = inicioDia.getTime() + H_INICIO * 3600000 + (clientX - ret.left) * msPorPx(ret.width);
    return Math.round(t / PASSO) * PASSO;
  };

  function comecarMover(e: React.PointerEvent, b: { os: OsConsole; comeco: number; termino: number; programada: boolean }, modo: "mover" | "fim") {
    if (e.button !== 0) return;
    e.stopPropagation();
    const trilho = (e.currentTarget as HTMLElement).closest("[data-trilho]")!;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastou.current = false;
    setMover({ osId: b.os.id, modo, x0: e.clientX, y0: e.clientY, largura: trilho.getBoundingClientRect().width,
      // Ainda sem horário programado (barra vai até o SLA): começa com 1 h de duração.
      comeco: b.comeco, termino: b.programada ? b.termino : b.comeco + 60 * 60000, delta: 0, tecnicoId: b.os.tecnico_id! });
  }

  function duranteMover(e: React.PointerEvent) {
    if (!mover) return;
    if (Math.abs(e.clientX - mover.x0) + Math.abs(e.clientY - mover.y0) > 4) arrastou.current = true;
    const delta = Math.round(((e.clientX - mover.x0) * msPorPx(mover.largura)) / PASSO) * PASSO;
    const linha = mover.modo === "mover" ? document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-tecnico]")?.getAttribute("data-tecnico") : null;
    setMover({ ...mover, delta, tecnicoId: linha ?? mover.tecnicoId });
    setAlvo(linha && linha !== mover.tecnicoId ? linha : null);
  }

  async function terminarMover() {
    const m = mover;
    setMover(null);
    setAlvo(null);
    if (!m || !arrastou.current) return;
    const os = ordens.find((o) => o.id === m.osId);
    if (!os) return;
    const inicio = m.modo === "mover" ? m.comeco + m.delta : m.comeco;
    const fim = m.modo === "mover" ? m.termino + m.delta : Math.max(m.comeco + PASSO, m.termino + m.delta);
    if (m.tecnicoId !== os.tecnico_id) return despachar(os.id, m.tecnicoId, { inicio, fim });
    if (m.delta === 0) return;
    const { error } = await supabase.from("ordens_servico")
      .update({ programada_inicio: new Date(inicio).toISOString(), programada_fim: new Date(fim).toISOString() }).eq("id", os.id);
    if (error) return alert(error.message);
    carregar();
  }

  // Mapa: técnicos em campo (posição atual) e O.S. do dia por status.
  useEffect(() => {
    let cancelado = false;
    import("maplibre-gl").then(({ Map, NavigationControl, Popup }) => {
      if (cancelado || !divMapa.current) return;
      const m = new Map({
        container: divMapa.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap", maxzoom: 19 } },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.5 } }],
        },
        center: CENTRO_INICIAL, zoom: 7,
      });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        m.addSource("os", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("tecnicos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "os", type: "circle", source: "os",
          paint: { "circle-radius": 7, "circle-color": ["get", "cor"], "circle-stroke-width": 2, "circle-stroke-color": "#1f2937" } });
        m.addLayer({ id: "os-num", type: "symbol", source: "os",
          layout: { "text-field": ["get", "numero"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
          paint: { "text-halo-color": "#fff", "text-halo-width": 2 } });
        m.addLayer({ id: "tecnicos", type: "circle", source: "tecnicos",
          paint: { "circle-radius": 13, "circle-color": ["get", "cor"], "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
        m.addLayer({ id: "tecnicos-sigla", type: "symbol", source: "tecnicos",
          layout: { "text-field": ["get", "sigla"], "text-size": 11, "text-allow-overlap": true },
          paint: { "text-color": "#fff" } });
        // Clique no técnico ou no carro: situação, tempo parado, km do dia e navegar até ele.
        m.on("click", "tecnicos", (e) => {
          const f = e.features?.[0];
          const alvo = alvoDoPonto(f?.properties);
          if (!alvo || f?.geometry.type !== "Point") return;
          const [lon, lat] = f.geometry.coordinates;
          abrirInfoNoMapa(m, Popup, alvo, lon, lat);
        });
        m.on("mouseenter", "tecnicos", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "tecnicos", () => { m.getCanvas().style.cursor = ""; });
        m.on("mouseenter", "os", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "os", () => { m.getCanvas().style.cursor = ""; });
        setMapaPronto(true);
      });
      mapa.current = m;
    });
    return () => { cancelado = true; mapa.current?.remove(); mapa.current = null; };
  }, []);

  const enquadrado = useRef(false);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !mapaPronto) return;
    const doDia = ordens.filter((o) => o.latitude != null && o.longitude != null &&
      (ABERTAS.includes(o.status) || barras.some((b) => b.os.id === o.id)));
    (m.getSource("os") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: doDia.map((o) => ({ type: "Feature", geometry: { type: "Point", coordinates: [o.longitude!, o.latitude!] },
        properties: { id: o.id, numero: String(o.numero), cor: COR[o.status].fundo } })),
    });
    // Técnico pelo celular (GPS do app) ou pelo carro (GEOCAR), conforme a escolha no mapa.
    const nomeDe = (id: string) => tecnicos.find((t) => t.id === id)?.nome ?? posicoes.find((p) => p.tecnico_id === id)?.nome ?? "?";
    const tecs = !ehHoje ? [] : fonte === "celular"
      ? posicoes.filter((p) => p.latitude != null && p.longitude != null).map((p) => ({
          lon: p.longitude!, lat: p.latitude!, sigla: iniciais(p.nome), cor: "#312D2A",
          info: { tipo: "celular", tecnico_id: p.tecnico_id, nome: p.nome },
        }))
      : carros.filter((c) => c.latitude != null && c.longitude != null).map((c) => ({
          lon: c.longitude!, lat: c.latitude!, sigla: iniciais(nomeDe(c.veiculos!.tecnico_id!)), cor: "#163A6B",
          info: { tipo: "veiculo", viat_id: c.viat_id, placa: c.matricula, nome: nomeDe(c.veiculos!.tecnico_id!) },
        }));
    (m.getSource("tecnicos") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: tecs.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { sigla: p.sigla, cor: p.cor, ...p.info } })),
    });
    const pts = [...doDia.map((o) => [o.longitude!, o.latitude!]), ...tecs.map((p) => [p.lon, p.lat])];
    if (pts.length && !enquadrado.current) {
      enquadrado.current = true;
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 50, maxZoom: 12, duration: 0 });
    }
    const abrir = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const id = e.features?.[0]?.properties?.id;
      const os = ordens.find((o) => o.id === id);
      if (os) setDetalhe(os);
    };
    m.on("click", "os", abrir);
    return () => { m.off("click", "os", abrir); };
  }, [ordens, barras, posicoes, carros, fonte, tecnicos, ehHoje, mapaPronto]);

  const mudarDia = (n: number) => {
    const d = new Date(inicioDia.getTime() + n * 86400000 + 3600000);
    setDia(isoDia(d));
  };
  const horas = Array.from({ length: H_FIM - H_INICIO + 1 }, (_, i) => H_INICIO + i);
  const posAgora = ehHoje && agora ? escala(agora) : null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Console de despacho</h2>
          <p className="text-xs text-gray-500">Arraste uma O.S. não atribuída até a linha do técnico para despachar.</p>
        </div>
        <button className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" onClick={() => mudarDia(-1)} aria-label="Dia anterior">‹</button>
        <span className="min-w-52 text-center text-sm font-medium">
          {inicioDia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </span>
        <button className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" onClick={() => mudarDia(1)} aria-label="Próximo dia">›</button>
        <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" onClick={() => setDia(isoDia(new Date()))}>Hoje</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div ref={divMapa} className="h-80 w-full" />
          <div className="absolute left-2 top-2 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white text-sm shadow-sm" role="group" aria-label="Posição do técnico pelo">
              {([["celular", "Celular"], ["veiculo", "Veículo (GEOCAR)"]] as const).map(([v, rotulo]) => (
                <button key={v} onClick={() => setFonte(v)} aria-pressed={fonte === v}
                  className={`px-3 py-1.5 ${fonte === v ? "bg-[#163A6B] text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            <button onClick={forcarAtualizacao} disabled={atualizando}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60">
              {atualizando ? "Atualizando..." : "↻ Atualizar"}
            </button>
            {atualizadoEm && <span className="rounded bg-white/90 px-2 py-0.5 text-xs text-gray-600">às {atualizadoEm.toLocaleTimeString("pt-BR")}</span>}
          </div>
          {fonte === "veiculo" && ehHoje && carros.length === 0 && (
            <p className="absolute bottom-2 left-2 right-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow">
              Nenhum carro da GEOCAR ligado a técnico. Cadastre a placa na Frota e vincule ao técnico.
            </p>
          )}
        </div>
        <section className="flex max-h-80 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <h3 className="text-sm font-semibold">Não atribuídas</h3>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs font-bold text-white">{naoAtribuidas.length}</span>
          </div>
          <ul className="flex-1 overflow-auto text-sm">
            {naoAtribuidas.length === 0 && <li className="p-3 text-gray-500">Nada aguardando despacho.</li>}
            {naoAtribuidas.map((o) => (
              <li key={o.id} draggable onDragStart={(e) => { setArrastando(o.id); e.dataTransfer.setData("text/plain", o.id); }}
                onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                onClick={() => setDetalhe(o)}
                className="cursor-grab border-b border-gray-100 px-3 py-2 hover:bg-gray-50 active:cursor-grabbing">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR[o.status].fundo }} />
                  <span className="truncate font-medium">{o.numero} · {o.titulo}</span>
                </div>
                <div className="truncate pl-4 text-xs text-gray-500">
                  {o.programada_inicio ? `📅 ${new Date(o.programada_inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ` : ""}
                  {o.tipo}{o.ticket_acionamento ? ` · ${o.ticket_acionamento}` : ""}{o.endereco ? ` · ${o.endereco}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          <div className="w-56 shrink-0 border-r border-gray-200 p-2">
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Nome do técnico" value={busca}
              onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="relative flex-1">
            {horas.map((h) => (
              <span key={h} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${escala(inicioDia.getTime() + h * 3600000)}%` }}>
                {h < H_FIM ? `${h}h` : ""}
              </span>
            ))}
            {posAgora != null && (
              <span className="absolute top-1 -translate-x-1/2 rounded bg-red-600 px-1 text-[10px] font-bold text-white" style={{ left: `${posAgora}%` }}>
                {hm(new Date(agora).toISOString())}
              </span>
            )}
          </div>
        </div>

        {linhas.map(({ t, barras: bs, expedientes: ex, refeicoes: rf, abertas, emCampo }) => (
          <div key={t.id} data-tecnico={t.id} className={`flex border-b border-gray-100 ${alvo === t.id ? "bg-blue-50" : ""}`}
            onDragOver={(e) => { if (arrastando) { e.preventDefault(); setAlvo(t.id); } }}
            onDragLeave={() => setAlvo((a) => (a === t.id ? null : a))}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setAlvo(null); setArrastando(null); if (!id) return;
              const inicio = horaNoPonto(e.clientX, e.currentTarget.querySelector("[data-trilho]")!);
              despachar(id, t.id, { inicio, fim: inicio + 60 * 60000 }); }}>
            <div className="flex w-56 shrink-0 items-center gap-2 border-r border-gray-200 px-2 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white ${emCampo ? "bg-green-700" : "bg-gray-500"}`}>
                {iniciais(t.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.nome}</div>
                <div className="text-xs text-gray-500">{emCampo ? "Em expediente" : "Fora do expediente"}</div>
              </div>
              {abertas > 0 && <span className="rounded bg-gray-200 px-1.5 text-xs font-semibold" title="O.S. em aberto">{abertas}</span>}
            </div>
            <div className="relative h-12 flex-1" data-trilho
              style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${100 / (H_FIM - H_INICIO)}% - 1px), #eef0f2 calc(${100 / (H_FIM - H_INICIO)}% - 1px), #eef0f2 ${100 / (H_FIM - H_INICIO)}%)` }}>
              {ex.map((e, i) => {
                const a = escala(new Date(e.inicio).getTime()), b = escala(e.fim ? new Date(e.fim).getTime() : agora);
                return <div key={`e${i}`} className="absolute inset-y-1 rounded bg-teal-50 ring-1 ring-teal-200" style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%` }}
                  title={`Expediente ${hm(e.inicio)}${e.fim ? `–${hm(e.fim)}` : " (em andamento)"}`} />;
              })}
              {rf.map((r, i) => {
                const a = escala(new Date(r.inicio).getTime()), b = escala(r.fim ? new Date(r.fim).getTime() : agora);
                return <div key={`r${i}`} className="absolute inset-y-2 z-10 flex items-center justify-center overflow-hidden rounded bg-gray-300 text-[10px] text-gray-700"
                  style={{ left: `${a}%`, width: `${Math.max(0.6, b - a)}%` }} title={`Refeição ${hm(r.inicio)}${r.fim ? `–${hm(r.fim)}` : ""}`}>🍴</div>;
              })}
              {/* Prévia da O.S. sendo arrastada para esta linha (transferência), já no horário novo. */}
              {mover && mover.modo === "mover" && mover.tecnicoId === t.id && barras.filter((b) => b.os.id === mover.osId && b.os.tecnico_id !== t.id).map((b) => (
                <div key="previa" className="pointer-events-none absolute inset-y-2 z-40 overflow-hidden whitespace-nowrap rounded px-1.5 text-[11px] font-medium ring-2 ring-gray-900"
                  style={{ left: `${escala(mover.comeco + mover.delta)}%`, width: `${Math.max(1.5, escala(mover.termino + mover.delta) - escala(mover.comeco + mover.delta))}%`,
                    background: COR[b.os.status].fundo, color: COR[b.os.status].texto }}>
                  {hm(new Date(mover.comeco + mover.delta).toISOString())} {b.os.numero} {b.os.titulo}
                </div>
              ))}
              {bs.map((barra) => {
                const { os, planejada, programada } = barra;
                const movendo = mover?.osId === os.id;
                // Indo para outra linha: aqui fica só a sombra (ela continua recebendo o arraste).
                const saindo = movendo && mover.modo === "mover" && mover.tecnicoId !== t.id;
                const comeco = movendo && !saindo ? mover.comeco + (mover.modo === "mover" ? mover.delta : 0) : barra.comeco;
                const termino = movendo && !saindo ? (mover.modo === "mover" ? mover.termino + mover.delta : Math.max(mover.comeco + PASSO, mover.termino + mover.delta)) : barra.termino;
                const a = escala(comeco), b = escala(termino), c = COR[os.status];
                const movel = planejada && ["rascunho", "enviada", "aceita"].includes(os.status);
                return (
                  <button key={os.id} onClick={() => { if (!arrastou.current) setDetalhe(os); arrastou.current = false; }}
                    onPointerDown={movel ? (e) => comecarMover(e, barra, "mover") : undefined}
                    onPointerMove={movel ? duranteMover : undefined}
                    onPointerUp={movel ? terminarMover : undefined}
                    className={`absolute inset-y-2 z-20 overflow-hidden whitespace-nowrap rounded px-1.5 text-left text-[11px] font-medium shadow-sm hover:ring-2 hover:ring-gray-800 ${movel ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${movendo ? (saindo ? "opacity-30" : "z-40 opacity-90 ring-2 ring-gray-900") : ""}`}
                    style={{
                      left: `${a}%`, width: `${Math.max(1.5, b - a)}%`, color: c.texto,
                      background: planejada && !programada ? `repeating-linear-gradient(135deg, ${c.fundo} 0 6px, #ffffff 6px 9px)` : c.fundo,
                      border: planejada ? `1px ${programada ? "solid" : "dashed"} ${c.texto}` : undefined,
                    }}
                    title={`O.S. ${os.numero} · ${os.titulo}\n${os.tipo} · ${rotuloStatus[os.status]}\n${programada ? `Programada ${hm(new Date(comeco).toISOString())} – ${hm(new Date(termino).toISOString())}` : planejada ? `Enviada ${hm(new Date(comeco).toISOString())}${os.sla_limite ? ` · SLA até ${hm(os.sla_limite)}` : ""}` : `${hm(new Date(comeco).toISOString())} – ${os.concluida_em ? hm(os.concluida_em) : "agora"}`}${os.endereco ? `\n${os.endereco}` : ""}${os.status === "rascunho" ? "\nBacklog programado: vai para o técnico às 06h do dia." : ""}${movel ? "\nArraste para mudar o horário ou o técnico; puxe a borda direita para mudar a duração." : ""}`}>
                    {os.status === "rascunho" ? "📅 " : ""}{movendo && !saindo ? `${hm(new Date(comeco).toISOString())}–${hm(new Date(termino).toISOString())} ` : ""}{os.numero} {os.titulo}
                    {movel && (
                      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/30" aria-label="Mudar a duração"
                        onPointerDown={(e) => comecarMover(e, barra, "fim")}
                        onPointerMove={(e) => { e.stopPropagation(); duranteMover(e); }}
                        onPointerUp={(e) => { e.stopPropagation(); terminarMover(); }} />
                    )}
                  </button>
                );
              })}
              {posAgora != null && <div className="absolute inset-y-0 z-30 w-0.5 bg-red-600" style={{ left: `${posAgora}%` }} />}
            </div>
          </div>
        ))}
        {linhas.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum técnico.</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 p-3 text-xs text-gray-600">
          {(["enviada", "aceita", "em_execucao", "pausada", "devolvida", "concluida", "baixada"] as StatusOS[]).map((s) => (
            <span key={s} className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm" style={{ background: COR[s].fundo }} />{rotuloStatus[s]}</span>
          ))}
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm border border-dashed border-gray-600"
            style={{ background: "repeating-linear-gradient(135deg, #93c5fd 0 4px, #fff 4px 6px)" }} />Aguardando início (até o SLA)</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm border border-gray-700" style={{ background: "#93c5fd" }} />Programada (arraste a barra para mudar horário ou técnico)</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm bg-teal-50 ring-1 ring-teal-200" />Expediente</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm bg-gray-300" />Refeição</span>
        </div>
      </section>

      {detalhe && <DetalheOS os={detalhe} fechar={() => { setDetalhe(null); carregar(); }} />}
    </div>
  );
}
