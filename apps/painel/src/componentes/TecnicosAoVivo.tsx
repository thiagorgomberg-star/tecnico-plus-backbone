"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { duracao, fmtKm, kmPercorridos, paradas, PARADA_MIN_MINUTOS, type Parada } from "@/lib/trajeto";

type Posicao = {
  tecnico_id: string;
  nome: string;
  registrado_em: string;
  latitude: number | null;
  longitude: number | null;
  velocidade_kmh: number | null;
  bateria_pct: number | null;
};

type Ponto = { tecnico_id: string; registrado_em: string; latitude: number; longitude: number; precisao_m: number | null };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const CORES = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
// Centro inicial do mapa (Vale do Paraíba) quando ainda não há posição.
const CENTRO_INICIAL: [number, number] = [-45.5, -23.0];

export default function TecnicosAoVivo() {
  const [posicoes, setPosicoes] = useState<Posicao[]>([]);
  const [trajeto, setTrajeto] = useState<Ponto[]>([]);
  const [agora, setAgora] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [intervalo, setIntervalo] = useState(30);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const divMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const [mapaPronto, setMapaPronto] = useState(false);
  const enquadrado = useRef(false);

  const carregar = useCallback(() => {
    supabase.from("posicao_atual_tecnicos").select("*").order("nome").then(({ data }) => {
      setPosicoes(data ?? []);
      setAgora(Date.now());
    });
    supabase.from("trajeto_do_dia").select("tecnico_id, registrado_em, latitude, longitude, precisao_m")
      .order("registrado_em").limit(20000)
      .then(({ data }) => {
        setTrajeto(data ?? []);
        setAtualizadoEm(new Date());
      });
  }, []);

  // Atualização programada do mapa e da lista (sem recarregar a página),
  // mais tempo real: posição nova chegando dispara uma atualização (agrupada a cada 3 s).
  useEffect(() => {
    carregar();
    const relogio = setInterval(carregar, intervalo * 1000);
    let agrupador: ReturnType<typeof setTimeout> | null = null;
    const emBreve = () => {
      if (agrupador) return;
      agrupador = setTimeout(() => { agrupador = null; carregar(); }, 3000);
    };
    const canal = supabase
      .channel("painel-gps")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posicoes_gps" }, emBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "expedientes" }, emBreve)
      .subscribe();
    return () => {
      clearInterval(relogio);
      if (agrupador) clearTimeout(agrupador);
      supabase.removeChannel(canal);
    };
  }, [carregar, intervalo]);

  // Cor fixa por técnico (pela ordem do nome).
  const corDe = useMemo(() => {
    const ids = [...new Set([...posicoes.map((p) => p.tecnico_id), ...trajeto.map((p) => p.tecnico_id)])].sort();
    return (id: string) => CORES[ids.indexOf(id) % CORES.length];
  }, [posicoes, trajeto]);

  // Km do dia e paradas por técnico (mesmas regras do km do relatório).
  const resumo = useMemo(() => {
    const porTecnico = new globalThis.Map<string, Ponto[]>();
    for (const p of trajeto) {
      if (!porTecnico.has(p.tecnico_id)) porTecnico.set(p.tecnico_id, []);
      porTecnico.get(p.tecnico_id)!.push(p);
    }
    const r = new globalThis.Map<string, { pontos: number; km: number; paradas: Parada[] }>();
    for (const [id, ps] of porTecnico) r.set(id, { pontos: ps.length, km: kmPercorridos(ps), paradas: paradas(ps) });
    return r;
  }, [trajeto]);

  // Cria o mapa uma vez (mapa de ruas do OpenStreetMap).
  useEffect(() => {
    let cancelado = false;
    import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (cancelado || !divMapa.current) return;
      const m = new Map({
        container: divMapa.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
              maxzoom: 19,
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: CENTRO_INICIAL,
        zoom: 8,
      });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        m.addSource("trajetos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("tecnicos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("paradas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "trajetos", type: "line", source: "trajetos",
          paint: { "line-color": ["get", "cor"], "line-width": 4, "line-opacity": 0.75 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        m.addLayer({
          id: "paradas", type: "circle", source: "paradas",
          paint: { "circle-radius": 8, "circle-color": "#fff", "circle-stroke-width": 3, "circle-stroke-color": ["get", "cor"] },
        });
        m.addLayer({
          id: "paradas-rotulo", type: "symbol", source: "paradas",
          layout: { "text-field": ["get", "rotulo"], "text-offset": [0, -1.3], "text-anchor": "bottom", "text-size": 11, "text-allow-overlap": true },
          paint: { "text-color": "#1f2937", "text-halo-color": "#fff", "text-halo-width": 2 },
        });
        m.addLayer({
          id: "tecnicos", type: "circle", source: "tecnicos",
          paint: { "circle-radius": 9, "circle-color": ["get", "cor"], "circle-stroke-width": 3, "circle-stroke-color": "#fff" },
        });
        m.addLayer({
          id: "nomes", type: "symbol", source: "tecnicos",
          layout: { "text-field": ["get", "nome"], "text-offset": [0, 1.4], "text-anchor": "top", "text-size": 12 },
          paint: { "text-halo-color": "#fff", "text-halo-width": 2 },
        });
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

  // Desenha posições atuais e o trajeto do dia.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !mapaPronto) return;
    const porTecnico = new globalThis.Map<string, [number, number][]>();
    for (const p of trajeto) {
      if (selecionado && p.tecnico_id !== selecionado) continue;
      if (!porTecnico.has(p.tecnico_id)) porTecnico.set(p.tecnico_id, []);
      porTecnico.get(p.tecnico_id)!.push([p.longitude, p.latitude]);
    }
    (m.getSource("trajetos") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [...porTecnico].filter(([, c]) => c.length > 1).map(([id, coords]) => ({
        type: "Feature", properties: { cor: corDe(id) }, geometry: { type: "LineString", coordinates: coords },
      })),
    });
    // Paradas só do técnico escolhido, com o tempo parado escrito no mapa.
    const minhas = selecionado ? resumo.get(selecionado)?.paradas ?? [] : [];
    (m.getSource("paradas") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: minhas.map((pa) => ({
        type: "Feature", properties: { cor: corDe(selecionado!), rotulo: `${duracao(pa.minutos)} (${hora(pa.inicio)}–${hora(pa.fim)})` },
        geometry: { type: "Point", coordinates: [pa.longitude, pa.latitude] },
      })),
    });
    const visiveis = posicoes.filter((p) => p.latitude != null && (!selecionado || p.tecnico_id === selecionado));
    (m.getSource("tecnicos") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: visiveis.map((p) => ({
        type: "Feature", properties: { cor: corDe(p.tecnico_id), nome: p.nome.split(" ")[0] },
        geometry: { type: "Point", coordinates: [p.longitude!, p.latitude!] },
      })),
    });

    // Enquadra todos na primeira carga; depois só quando o supervisor escolhe alguém.
    const pontos = [...visiveis.map((p) => [p.longitude!, p.latitude!] as [number, number]), ...[...porTecnico.values()].flat()];
    if (pontos.length && (!enquadrado.current || selecionado)) {
      const lons = pontos.map((p) => p[0]), lats = pontos.map((p) => p[1]);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 15, duration: 600 });
      enquadrado.current = true;
    }
  }, [posicoes, trajeto, selecionado, mapaPronto, corDe, resumo]);

  return (
    <section className="grid overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[320px_1fr]">
      <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-600" />
          {atualizadoEm ? `Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR")}` : "Carregando..."}
          <select className="ml-auto rounded border border-gray-200 px-1 py-0.5" value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}
            title="Intervalo de atualização">
            <option value={15}>a cada 15 s</option>
            <option value={30}>a cada 30 s</option>
            <option value={60}>a cada 1 min</option>
            <option value={300}>a cada 5 min</option>
          </select>
          <button className="rounded px-1.5 py-0.5 text-blue-700 hover:bg-blue-50" onClick={carregar} title="Atualizar agora">↻</button>
        </div>
        <h2 className="flex items-center border-b border-gray-200 p-4 font-semibold">
          Em expediente ({posicoes.length})
          {selecionado && (
            <button className="ml-auto text-sm font-normal text-blue-700 hover:underline" onClick={() => setSelecionado(null)}>
              Ver todos
            </button>
          )}
        </h2>
        {posicoes.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Nenhum técnico com expediente aberto.</p>
        ) : (
          <ul>
            {posicoes.map((p) => {
              const minutos = Math.round((agora - new Date(p.registrado_em).getTime()) / 60000);
              const res = resumo.get(p.tecnico_id);
              const aberto = selecionado === p.tecnico_id;
              return (
                <li key={p.tecnico_id}>
                  <button onClick={() => setSelecionado(p.tecnico_id === selecionado ? null : p.tecnico_id)}
                    className={`block w-full border-b border-gray-100 p-4 text-left text-sm hover:bg-gray-50 ${selecionado === p.tecnico_id ? "bg-blue-50" : ""}`}>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: corDe(p.tecnico_id) }} />
                      {p.nome}
                    </span>
                    <span className={`mt-1 block ${minutos > 15 ? "text-red-700" : "text-gray-500"}`}>
                      {p.latitude == null ? "aguardando o primeiro sinal de GPS · " : ""}última atualização há {minutos} min
                      {p.velocidade_kmh != null && p.velocidade_kmh > 3 ? ` · ${Math.round(p.velocidade_kmh)} km/h` : ""}
                      {p.bateria_pct != null ? ` · bateria ${p.bateria_pct}%` : ""}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500">
                      <b className="text-sm text-gray-900">{fmtKm(res?.km ?? 0)}</b> percorridos hoje · {res?.paradas.length ?? 0} paradas
                    </span>
                  </button>
                  {aberto && (
                    <div className="border-b border-gray-100 bg-blue-50/50 px-4 pb-3 text-sm">
                      <p className="py-2 text-xs text-gray-500">
                        Paradas de {PARADA_MIN_MINUTOS} min ou mais (clique para ver no mapa) · {res?.pontos ?? 0} pontos de GPS hoje
                      </p>
                      {!res?.paradas.length ? <p className="text-xs text-gray-500">Nenhuma parada hoje.</p> : (
                        <ol className="grid gap-1">
                          {res.paradas.map((pa, i) => (
                            <li key={pa.inicio}>
                              <button className="flex w-full items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-left hover:bg-blue-100"
                                onClick={() => mapa.current?.flyTo({ center: [pa.longitude, pa.latitude], zoom: 16 })}>
                                <span className="w-5 text-xs text-gray-400">{i + 1}.</span>
                                <span>{hora(pa.inicio)}–{hora(pa.fim)}</span>
                                <b className="ml-auto">{duracao(pa.minutos)}</b>
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                      {!!res?.paradas.length && (
                        <p className="mt-2 text-xs text-gray-600">Total parado: <b>{duracao(res.paradas.reduce((t, pa) => t + pa.minutos, 0))}</b></p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div ref={divMapa} className="h-[70vh] min-h-96 w-full" />
    </section>
  );
}
