"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { Coord } from "@/lib/tracado";

export type MarcaEvento = { id: number; titulo: string; texto: string; nivel: "ok" | "atencao" | "critico"; ponto: Coord };
const COR = { ok: "#1E9E4A", atencao: "#D99A00", critico: "#D0453B" };

// Mapa (OpenStreetMap) com o traçado do KMZ, as pontas A e B e os eventos da curva coloridos pela situação.
export default function MapaEventosCurva({ caminho, pontaA, pontaB, medidoEm, eventos, selecionado, selecionar }: {
  caminho: Coord[]; pontaA: Coord & { nome: string }; pontaB: Coord & { nome: string }; medidoEm: "A" | "B";
  eventos: MarcaEvento[]; selecionado: number | null; selecionar: (id: number) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const [pronto, setPronto] = useState(false);
  const aoClicar = useRef(selecionar);
  aoClicar.current = selecionar;

  useEffect(() => {
    let cancelado = false;
    import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (cancelado || !div.current) return;
      const m = new Map({
        container: div.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap", maxzoom: 19 } },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
          glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        },
        center: [pontaA.lng, pontaA.lat], zoom: 10,
      });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        const vazio = { type: "FeatureCollection" as const, features: [] };
        m.addSource("cabo", { type: "geojson", data: vazio });
        m.addSource("pontas", { type: "geojson", data: vazio });
        m.addSource("eventos", { type: "geojson", data: vazio });
        m.addLayer({ id: "cabo", type: "line", source: "cabo", paint: { "line-color": "#163A6B", "line-width": 4, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
        m.addLayer({ id: "pontas", type: "circle", source: "pontas", paint: { "circle-radius": 9, "circle-color": ["get", "cor"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        m.addLayer({ id: "pontas-rotulo", type: "symbol", source: "pontas", layout: { "text-field": ["get", "rotulo"], "text-size": 12, "text-offset": [0, 1.6], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#111", "text-halo-color": "#fff", "text-halo-width": 2 } });
        m.addLayer({ id: "eventos", type: "circle", source: "eventos", paint: {
          "circle-radius": ["case", ["get", "sel"], 11, 7], "circle-color": ["get", "cor"], "circle-stroke-color": ["case", ["get", "sel"], "#111", "#fff"], "circle-stroke-width": 2,
        } });
        m.addLayer({ id: "eventos-rotulo", type: "symbol", source: "eventos", layout: { "text-field": ["get", "num"], "text-size": 10, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
        m.on("click", "eventos", (e) => { const id = e.features?.[0]?.properties?.id; if (id != null) aoClicar.current(Number(id)); });
        m.on("mouseenter", "eventos", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "eventos", () => { m.getCanvas().style.cursor = ""; });
        setPronto(true);
      });
      mapa.current = m;
    });
    return () => { cancelado = true; mapa.current?.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Traçado e pontas: enquadra quando mudam.
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m || caminho.length < 2) return;
    (m.getSource("cabo") as GeoJSONSource).setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: caminho.map((p) => [p.lng, p.lat]) } });
    (m.getSource("pontas") as GeoJSONSource).setData({ type: "FeatureCollection", features: ([["A", pontaA], ["B", pontaB]] as const).map(([l, p]) => ({
      type: "Feature", properties: { rotulo: `${l} · ${p.nome}${medidoEm === l ? " (OTDR)" : ""}`, cor: medidoEm === l ? "#0572CE" : "#667085" },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })) });
    const lngs = caminho.map((p) => p.lng), lats = caminho.map((p) => p.lat);
    m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0 });
  }, [pronto, caminho, pontaA, pontaB, medidoEm]);

  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    (m.getSource("eventos") as GeoJSONSource).setData({ type: "FeatureCollection", features: eventos.map((e) => ({
      type: "Feature", properties: { id: e.id, num: String(e.id), cor: COR[e.nivel], sel: e.id === selecionado },
      geometry: { type: "Point", coordinates: [e.ponto.lng, e.ponto.lat] },
    })) });
  }, [pronto, eventos, selecionado]);

  useEffect(() => {
    const e = eventos.find((x) => x.id === selecionado);
    if (pronto && e) mapa.current?.easeTo({ center: [e.ponto.lng, e.ponto.lat], zoom: Math.max(mapa.current.getZoom(), 15) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  const sel = eventos.find((x) => x.id === selecionado);
  return (
    <div className="grid gap-2">
      <div ref={div} className="h-[420px] w-full overflow-hidden rounded-lg border border-gray-200" />
      {sel ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: `${COR[sel.nivel]}14` }}>
          <b style={{ color: COR[sel.nivel] }}>{sel.titulo}</b> · {sel.texto}
        </p>
      ) : <p className="text-xs text-gray-500">Clique num evento do mapa ou da tabela para ver o detalhe.</p>}
    </div>
  );
}
