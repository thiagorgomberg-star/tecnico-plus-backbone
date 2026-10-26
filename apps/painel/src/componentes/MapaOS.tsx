"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as Mapa } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

type Ponto = { lat: number; lon: number; aproximado: boolean; doEvento: boolean };

// Mapa pequeno com o local da O.S. Usa o ponto do evento ou o de abertura; sem eles, procura o endereço
// no OpenStreetMap (local aproximado).
export default function MapaOS({ latitude, longitude, doEvento, endereco }: { latitude?: number | null; longitude?: number | null; doEvento?: boolean; endereco?: string | null }) {
  const div = useRef<HTMLDivElement>(null);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [situacao, setSituacao] = useState<"buscando" | "ok" | "sem">("buscando");

  useEffect(() => {
    let vivo = true;
    if (latitude != null && longitude != null) {
      setPonto({ lat: latitude, lon: longitude, aproximado: false, doEvento: !!doEvento });
      setSituacao("ok");
      return;
    }
    const busca = endereco?.trim();
    if (!busca) { setSituacao("sem"); return; }
    setSituacao("buscando");
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(busca)}`)
      .then((r) => r.json())
      .then((lista: { lat: string; lon: string }[]) => {
        if (!vivo) return;
        if (lista[0]) { setPonto({ lat: Number(lista[0].lat), lon: Number(lista[0].lon), aproximado: true, doEvento: false }); setSituacao("ok"); }
        else setSituacao("sem");
      })
      .catch(() => vivo && setSituacao("sem"));
    return () => { vivo = false; };
  }, [latitude, longitude, doEvento, endereco]);

  useEffect(() => {
    if (!ponto) return;
    let m: Mapa | null = null;
    let cancelado = false;
    import("maplibre-gl").then(({ Map, Marker, NavigationControl }) => {
      if (cancelado || !div.current) return;
      m = new Map({
        container: div.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap", maxzoom: 19 } },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [ponto.lon, ponto.lat], zoom: ponto.aproximado ? 14 : 16,
      });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      new Marker({ color: ponto.aproximado ? "#d97706" : "#dc2626" }).setLngLat([ponto.lon, ponto.lat]).addTo(m);
    });
    return () => { cancelado = true; m?.remove(); };
  }, [ponto]);

  if (situacao === "sem") return <p className="mt-1 text-sm text-gray-500">Sem localização registrada e endereço não encontrado no mapa.</p>;
  return (
    <div className="mt-1">
      <div ref={div} className="h-64 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {situacao === "buscando" && <p className="p-3 text-sm text-gray-500">Procurando o local...</p>}
      </div>
      {ponto && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span>{ponto.aproximado ? "📍 Local aproximado pelo endereço" : ponto.doEvento ? "📍 Local do evento registrado pelo técnico" : "📍 Local informado na abertura da O.S."}</span>
          <a className="font-medium text-blue-700 hover:underline" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&destination=${ponto.lat},${ponto.lon}`}>Navegar até aqui</a>
        </div>
      )}
    </div>
  );
}
