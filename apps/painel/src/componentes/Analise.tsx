"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { baixarXlsx } from "@/lib/planilha";
import { supabase } from "@/lib/supabase";
import { TIPOS_OS } from "@/lib/tipos";

type Ocorrencia = {
  id: string; numero: number; tipo: string; status: string; titulo: string; ticket_acionamento: string | null;
  criado_em: string; iniciada_em: string | null; concluida_em: string | null; sla_limite: string | null;
  trecho: string | null; tecnico: string | null; latitude: number | null; longitude: number | null; caixas: number;
};
// Eventos capturados em campo fora das O.S. (view mapa_eventos): informados pelo técnico e anotados na vistoria.
type EventoCampo = {
  fonte: "informado" | "vistoria"; id: string; descricao: string; gravidade: string | null; criado_em: string; tecnico: string | null;
  situacao: string; os_numero: number | null; latitude: number | null; longitude: number | null;
};
type Fonte = "os" | "informado" | "vistoria";
const FONTES: [Fonte, string, string][] = [["os", "O.S.", "#2a78d6"], ["informado", "Ocorrências informadas", "#d0453b"], ["vistoria", "Anotados na vistoria", "#7a5aa6"]];
type Gasto = { data: string; categoria: string; valor: number; tecnico: string; status: string; os_id: string | null };

// Paleta categórica de referência (ordem fixa, validada para barras empilhadas) e rampa sequencial azul.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const GRUPOS_GASTO: [string, string[]][] = [
  ["Combustível", ["combustivel"]], ["Pedágio e estacionamento", ["pedagio", "estacionamento"]],
  ["Alimentação e hospedagem", ["alimentacao", "hospedagem"]], ["Ferramentas e material", ["ferramenta", "material"]],
  ["Outros", ["manutencao_veiculo", "outros"]],
];
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const mesRotulo = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const CENTRO_INICIAL: [number, number] = [-45.5, -23.0];

// Análise (BI): onde e quando acontecem as ocorrências, e quanto se gasta em campo.
export default function Analise() {
  const [dias, setDias] = useState(180);
  const [tipo, setTipo] = useState("");
  const [trecho, setTrecho] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [modo, setModo] = useState<"calor" | "pontos">("calor");
  const [os, setOs] = useState<Ocorrencia[]>([]);
  const [eventos, setEventos] = useState<EventoCampo[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>(["os", "informado", "vistoria"]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const divMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const [mapaPronto, setMapaPronto] = useState(false);

  useEffect(() => {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const lista: string[] = [];
    for (let d = new Date(desde); d <= new Date(); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    supabase.from("analise_os").select("*").gte("criado_em", desde).limit(10000)
      .then(({ data }) => {
        setMeses(lista);
        setOs((data as Ocorrencia[]) ?? []);
      });
    supabase.from("mapa_eventos").select("*").gte("criado_em", desde).limit(10000)
      .then(({ data }) => setEventos((data as EventoCampo[]) ?? []));
    supabase.from("despesas_planilha").select("data, categoria, valor, tecnico, status, os_id").gte("data", desde.slice(0, 10)).neq("status", "recusada")
      .limit(10000).then(({ data }) => setGastos((data as Gasto[]) ?? []));
  }, [dias]);

  const opcoes = useMemo(() => ({
    trechos: [...new Set(os.map((o) => o.trecho).filter((t): t is string => !!t))].sort(),
    tecnicos: [...new Set([...os.map((o) => o.tecnico), ...gastos.map((g) => g.tecnico)].filter((t): t is string => !!t))].sort(),
  }), [os, gastos]);

  const filtradas = useMemo(() => os.filter((o) =>
    (!tipo || o.tipo === tipo) && (!trecho || o.trecho === trecho) && (!tecnico || o.tecnico === tecnico)), [os, tipo, trecho, tecnico]);
  const eventosFiltrados = useMemo(() => eventos.filter((e) => !tecnico || e.tecnico === tecnico), [eventos, tecnico]);
  const gastosFiltrados = useMemo(() => gastos.filter((g) => !tecnico || g.tecnico === tecnico), [gastos, tecnico]);

  const r = useMemo(() => {
    const tipos = TIPOS_OS.filter((t) => !tipo || t === tipo);
    const porMes = meses.map((m) => ({ m, v: tipos.map((t) => filtradas.filter((o) => o.tipo === t && o.criado_em.slice(0, 7) === m).length) }));
    const grade = SEMANA.map(() => Array(24).fill(0) as number[]);
    for (const o of filtradas) {
      const d = new Date(o.criado_em);
      grade[d.getDay()][d.getHours()]++;
    }
    const porTrecho = new Map<string, number>();
    for (const o of filtradas) porTrecho.set(o.trecho ?? "Sem trecho", (porTrecho.get(o.trecho ?? "Sem trecho") ?? 0) + 1);
    const gastoMes = meses.map((m) => ({
      m, v: GRUPOS_GASTO.map(([, cats]) => gastosFiltrados.filter((g) => cats.includes(g.categoria) && g.data.slice(0, 7) === m).reduce((t, g) => t + Number(g.valor), 0)),
    }));
    const gastoTecnico = new Map<string, number>();
    for (const g of gastosFiltrados) gastoTecnico.set(g.tecnico, (gastoTecnico.get(g.tecnico) ?? 0) + Number(g.valor));
    const comSla = filtradas.filter((o) => o.concluida_em && o.sla_limite);
    const totalGasto = gastosFiltrados.reduce((t, g) => t + Number(g.valor), 0);
    return {
      meses, tipos, porMes, grade, maxGrade: Math.max(1, ...grade.flat()),
      porTrecho: [...porTrecho.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      gastoMes, gastoTecnico: [...gastoTecnico.entries()].sort((a, b) => b[1] - a[1]),
      totalGasto,
      sla: comSla.length ? Math.round((comSla.filter((o) => o.concluida_em! <= o.sla_limite!).length / comSla.length) * 100) : null,
      corretivas: filtradas.filter((o) => o.tipo === "Corretiva").length,
      semLocal: filtradas.filter((o) => o.latitude == null).length,
    };
  }, [filtradas, gastosFiltrados, meses, tipo]);

  // Mapa (OpenStreetMap) com camada de calor; de perto, mostra cada ocorrência.
  useEffect(() => {
    let cancelado = false;
    import("maplibre-gl").then(({ Map, NavigationControl, Popup }) => {
      if (cancelado || !divMapa.current) return;
      const m = new Map({
        container: divMapa.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap", maxzoom: 19 } },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6 } }],
        },
        center: CENTRO_INICIAL, zoom: 7,
      });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        m.addSource("ocorrencias", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "calor", type: "heatmap", source: "ocorrencias",
          paint: {
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 14, 12, 30],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 2],
            "heatmap-opacity": 0.85,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(205,226,251,0)", 0.15, RAMPA[1], 0.35, RAMPA[2], 0.55, RAMPA[3], 0.75, RAMPA[4], 0.9, RAMPA[5], 1, RAMPA[6]],
          },
        });
        m.addLayer({
          id: "pontos", type: "circle", source: "ocorrencias", layout: { visibility: "none" },
          paint: { "circle-radius": 6, "circle-color": ["get", "cor"], "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
        });
        m.on("click", "pontos", (e) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          const div = document.createElement("div");
          div.style.fontSize = "12px";
          div.textContent = String(p.texto);
          new Popup().setLngLat(e.lngLat).setDOMContent(div).addTo(m);
        });
        m.on("mouseenter", "pontos", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "pontos", () => { m.getCanvas().style.cursor = ""; });
        setMapaPronto(true);
      });
      mapa.current = m;
    });
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !mapaPronto) return;
    const daOs = fontes.includes("os") ? filtradas.filter((o) => o.latitude != null && o.longitude != null).map((o) => ({
      lon: o.longitude!, lat: o.latitude!,
      texto: `O.S. ${o.numero} · ${o.tipo} · ${new Date(o.criado_em).toLocaleDateString("pt-BR")}${o.trecho ? ` · ${o.trecho}` : ""}`,
      cor: SERIES[TIPOS_OS.indexOf(o.tipo)] ?? "#52514e",
    })) : [];
    const deCampo = eventosFiltrados.filter((e) => fontes.includes(e.fonte) && e.latitude != null && e.longitude != null).map((e) => ({
      lon: e.longitude!, lat: e.latitude!,
      texto: `${e.fonte === "informado" ? "Ocorrência informada" : "Vistoria"} · ${e.descricao} · ${new Date(e.criado_em).toLocaleDateString("pt-BR")}${e.tecnico ? ` · ${e.tecnico}` : ""}${e.os_numero ? ` · O.S. ${e.os_numero}` : ""}`,
      cor: FONTES.find(([f]) => f === e.fonte)![2],
    }));
    const comLocal = [...daOs, ...deCampo];
    (m.getSource("ocorrencias") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: comLocal.map((o) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [o.lon, o.lat] }, properties: { texto: o.texto, cor: o.cor },
      })),
    });
    m.setLayoutProperty("calor", "visibility", modo === "calor" ? "visible" : "none");
    m.setLayoutProperty("pontos", "visibility", modo === "pontos" ? "visible" : "none");
    if (comLocal.length) {
      const lons = comLocal.map((o) => o.lon), lats = comLocal.map((o) => o.lat);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, maxZoom: 12, duration: 0 });
    }
  }, [filtradas, eventosFiltrados, fontes, modo, mapaPronto]);

  async function exportar() {
    const cab = ["O.S.", "Ticket", "Tipo", "Situação", "Título", "Trecho", "Técnico", "Aberta em", "Iniciada em", "Concluída em",
      "SLA até", "No prazo", "Caixas", "Latitude", "Longitude"];
    const dt = (s: string | null) => (s ? new Date(s) : null);
    await baixarXlsx("Ocorrencias", "Ocorrências", cab, filtradas.map((o) => [
      o.numero, o.ticket_acionamento, o.tipo, o.status, o.titulo, o.trecho, o.tecnico, dt(o.criado_em), dt(o.iniciada_em), dt(o.concluida_em),
      dt(o.sla_limite), o.concluida_em && o.sla_limite ? (o.concluida_em <= o.sla_limite ? "Sim" : "Não") : null, o.caixas, o.latitude, o.longitude,
    ]));
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  const maxMes = Math.max(1, ...r.porMes.map((p) => p.v.reduce((a, b) => a + b, 0)));
  const maxGastoMes = Math.max(1, ...r.gastoMes.map((p) => p.v.reduce((a, b) => a + b, 0)));
  const maxTrecho = Math.max(1, ...r.porTrecho.map(([, n]) => n));
  const maxGastoTec = Math.max(1, ...r.gastoTecnico.map(([, v]) => v));
  const cartao = (rotulo: string, valor: string, detalhe?: string) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold">{valor}</div>
      {detalhe && <div className="text-xs text-gray-500">{detalhe}</div>}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Análise</h2>
        <select className={campo} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={30}>Últimos 30 dias</option><option value={90}>Últimos 3 meses</option>
          <option value={180}>Últimos 6 meses</option><option value={365}>Últimos 12 meses</option>
        </select>
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>{TIPOS_OS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={campo} value={trecho} onChange={(e) => setTrecho(e.target.value)}>
          <option value="">Todos os trechos</option>{opcoes.trechos.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={campo} value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
          <option value="">Todos os técnicos</option>{opcoes.tecnicos.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!filtradas.length}
          onClick={exportar}>Baixar ocorrências (Excel)</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cartao("Ocorrências", String(filtradas.length), `${r.corretivas} corretivas`)}
        {cartao("SLA cumprido", r.sla == null ? "—" : `${r.sla}%`, "concluídas em até 4h")}
        {cartao("Gastos de campo", reais(r.totalGasto), "sem as recusadas")}
        {cartao("Gasto por ocorrência", filtradas.length ? reais(r.totalGasto / filtradas.length) : "—", "gasto total ÷ ocorrências")}
        {cartao("Sem localização", String(r.semLocal), "fora do mapa")}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 p-3">
          <h3 className="mr-auto font-semibold">Mapa de calor dos eventos de campo</h3>
          {FONTES.map(([f, rotulo, cor]) => {
            const ligado = fontes.includes(f);
            const total = f === "os" ? filtradas.filter((o) => o.latitude != null).length : eventosFiltrados.filter((e) => e.fonte === f).length;
            return (
              <button key={f} onClick={() => setFontes((l) => (ligado ? l.filter((x) => x !== f) : [...l, f]))}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${ligado ? "border-transparent bg-[#163A6B] text-white" : "border-gray-300 text-gray-500"}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: cor }} />{rotulo} {total}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-gray-200" />
          {(["calor", "pontos"] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)}
              className={`rounded-md px-3 py-1.5 text-sm ${modo === m ? "bg-gray-100 font-medium" : "text-gray-600"}`}>
              {m === "calor" ? "Calor" : "Pontos por tipo"}
            </button>
          ))}
        </div>
        <div ref={divMapa} className="h-[440px] w-full" />
        <div className="flex flex-wrap items-center gap-3 p-3 text-xs text-gray-600">
          {modo === "calor" ? (
            <>
              <span>Menos</span>
              <span className="flex h-3 w-40 overflow-hidden rounded">{RAMPA.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
              <span>Mais ocorrências</span>
            </>
          ) : (
            <>
              {fontes.includes("os") && TIPOS_OS.map((t, i) => (
                <span key={t} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i] ?? "#52514e" }} />{t}</span>
              ))}
              {FONTES.filter(([f]) => f !== "os" && fontes.includes(f)).map(([f, rotulo, cor]) => (
                <span key={f} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />{rotulo}</span>
              ))}
            </>
          )}
          <span className="ml-auto">Usa o ponto marcado em campo; sem ele, o local da O.S.</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold">Ocorrências por mês</h3>
          <Legenda itens={r.tipos.map((t) => [t, SERIES[TIPOS_OS.indexOf(t)]])} />
          <Barras meses={r.porMes} max={maxMes} cores={r.tipos.map((t) => SERIES[TIPOS_OS.indexOf(t)])} nomes={r.tipos} formato={(n) => String(n)} />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold">Gastos por mês</h3>
          <Legenda itens={GRUPOS_GASTO.map(([n], i) => [n, SERIES[i]])} />
          <Barras meses={r.gastoMes} max={maxGastoMes} cores={SERIES} nomes={GRUPOS_GASTO.map(([n]) => n)} formato={reais} />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold">Quando acontecem (dia × hora de abertura)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="border-separate" style={{ borderSpacing: 2 }}>
              <tbody>
                {r.grade.map((linha, d) => (
                  <tr key={d}>
                    <td className="pr-2 text-xs text-gray-500">{SEMANA[d]}</td>
                    {linha.map((n, h) => (
                      <td key={h} title={`${SEMANA[d]} ${h}h: ${n} ocorrência(s)`} className="h-5 w-5 rounded-sm"
                        style={{ background: n ? RAMPA[Math.min(RAMPA.length - 1, Math.ceil((n / r.maxGrade) * (RAMPA.length - 1)))] : "#f3f3f1" }} />
                    ))}
                  </tr>
                ))}
                <tr>
                  <td />
                  {Array.from({ length: 24 }, (_, h) => <td key={h} className="text-center text-[10px] text-gray-400">{h % 3 === 0 ? h : ""}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold">Trechos com mais ocorrências</h3>
          <Ranking itens={r.porTrecho} max={maxTrecho} formato={(n) => String(n)} />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="font-semibold">Gastos por técnico</h3>
          <Ranking itens={r.gastoTecnico} max={maxGastoTec} formato={reais} />
        </section>
      </div>
    </div>
  );
}

function Legenda({ itens }: { itens: [string, string][] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
      {itens.map(([n, c]) => <span key={n} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{n}</span>)}
    </div>
  );
}

// Colunas empilhadas por mês (fatias separadas por 2px, ponta arredondada), com o total em cima e detalhe no hover.
function Barras({ meses, max, cores, nomes, formato }: {
  meses: { m: string; v: number[] }[]; max: number; cores: string[]; nomes: string[]; formato: (n: number) => string;
}) {
  return (
    <div className="mt-4 flex h-48 items-end gap-2 border-b border-gray-200">
      {meses.map(({ m, v }) => {
        const total = v.reduce((a, b) => a + b, 0);
        return (
          <div key={m} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`${mesRotulo(m)}\n${nomes.map((n, i) => (v[i] ? `${n}: ${formato(v[i])}` : "")).filter(Boolean).join("\n")}\nTotal: ${formato(total)}`}>
            {total > 0 && <span className="mb-1 truncate text-[10px] text-gray-600">{formato(total)}</span>}
            <div className="flex w-full max-w-10 flex-col-reverse gap-[2px] overflow-hidden rounded-t" style={{ height: `${(total / max) * 85}%` }}>
              {v.map((n, i) => n > 0 && <div key={i} style={{ flexGrow: n, background: cores[i] }} />)}
            </div>
            <span className="mt-1 text-[10px] text-gray-500">{mesRotulo(m)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Ranking({ itens, max, formato }: { itens: [string, number][]; max: number; formato: (n: number) => string }) {
  if (!itens.length) return <p className="mt-3 text-sm text-gray-500">Sem dados no período.</p>;
  return (
    <ul className="mt-3 grid gap-2 text-sm">
      {itens.map(([n, v]) => (
        <li key={n} title={`${n}: ${formato(v)}`}>
          <div className="flex justify-between"><span className="truncate">{n}</span><span className="font-medium">{formato(v)}</span></div>
          <div className="mt-1 h-2 rounded bg-gray-100"><div className="h-2 rounded" style={{ width: `${(v / max) * 100}%`, background: SERIES[0] }} /></div>
        </li>
      ))}
    </ul>
  );
}
