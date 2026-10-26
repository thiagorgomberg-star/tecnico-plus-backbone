import { Camera, type CameraRef, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cores, sombra } from '../lib/estilo';
import { ESTILO_MAPA } from '../lib/mapaOffline';
import Icone from './Icone';

type LatLng = { lat: number; lng: number };
export type PontoMapa = LatLng & { id: string; cor: string; rotulo: string; ativo?: boolean; marca?: string; contorno?: string };
export type LinhaMapa = { id: string; de: LatLng; para: LatLng; cor: string; tracejada?: boolean };

// Mapa com ruas de fundo (guardado no celular para usar sem sinal). Se o fundo não carregar
// (sem sinal e área ainda não baixada), mostra a reserva: o desenho próprio do app.
export default function MapaVetorial({ pontos, linhas = [], aqui, aquiEstilo = 'voce', altura, enquadrar, foco, tocar, reserva }: {
  pontos: PontoMapa[]; linhas?: LinhaMapa[]; aqui: LatLng | null; aquiEstilo?: 'voce' | 'novo';
  altura: number; enquadrar: LatLng[]; foco?: LatLng | null; tocar: (id: string) => void; reserva: ReactNode;
}) {
  const [falhou, setFalhou] = useState(false);
  const camera = useRef<CameraRef>(null);
  const zoomAtual = useRef(12);

  const limites = useMemo(() => {
    if (!enquadrar.length) return null;
    const lats = enquadrar.map((p) => p.lat), lngs = enquadrar.map((p) => p.lng);
    const m = 0.004; // ~400 m, para um ponto só não virar zoom máximo
    return [Math.min(...lngs) - m, Math.min(...lats) - m, Math.max(...lngs) + m, Math.max(...lats) + m] as [number, number, number, number];
  }, [enquadrar]);

  useEffect(() => {
    if (foco) camera.current?.flyTo({ center: [foco.lng, foco.lat], zoom: Math.max(zoomAtual.current, 14), duration: 600 });
  }, [foco?.lat, foco?.lng]);

  const dadosPontos = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: pontos.map((p) => ({
      type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, cor: p.cor, rotulo: p.rotulo, ativo: p.ativo ? 1 : 0, marca: p.marca ?? '', contorno: p.contorno ?? (p.ativo ? '#F5B301' : '#FFFFFF') },
    })),
  }), [pontos]);
  const dadosLinhas = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: linhas.map((l) => ({
      type: 'Feature', id: l.id, geometry: { type: 'LineString', coordinates: [[l.de.lng, l.de.lat], [l.para.lng, l.para.lat]] },
      properties: { cor: l.cor, tracejada: l.tracejada ? 1 : 0 },
    })),
  }), [linhas]);
  const dadosAqui = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: aqui ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [aqui.lng, aqui.lat] }, properties: {} }] : [],
  }), [aqui?.lat, aqui?.lng]);

  if (falhou || !limites) return <>{reserva}</>;

  const zoom = (d: number) => camera.current?.zoomTo(Math.min(Math.max(zoomAtual.current + d, 4), 19), { duration: 250 });

  return (
    <View style={{ height: altura }}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={ESTILO_MAPA}
        androidView="texture"
        logo={false}
        compass={false}
        scaleBar
        scaleBarPosition={{ bottom: 8, left: 8 }}
        attributionPosition={{ bottom: 8, right: 8 }}
        touchRotate={false}
        touchPitch={false}
        onDidFailLoadingMap={() => setFalhou(true)}
        onRegionDidChange={(e) => { zoomAtual.current = e.nativeEvent.zoom; }}
      >
        <Camera ref={camera} initialViewState={{ bounds: limites, padding: { top: 48, bottom: 48, left: 40, right: 40 } }} minZoom={4} maxZoom={19} />
        <GeoJSONSource id="linhas" data={dadosLinhas}>
          <Layer id="linhas-cheias" type="line" filter={['==', ['get', 'tracejada'], 0]}
            paint={{ 'line-color': ['get', 'cor'], 'line-width': 2.5 }} layout={{ 'line-cap': 'round' }} />
          <Layer id="linhas-tracejadas" type="line" filter={['==', ['get', 'tracejada'], 1]}
            paint={{ 'line-color': ['get', 'cor'], 'line-width': 2.5, 'line-dasharray': [2, 1.6] }} />
        </GeoJSONSource>
        <GeoJSONSource id="aqui" data={dadosAqui}>
          {aquiEstilo === 'novo' ? (
            <Layer id="aqui-circulo" type="circle"
              paint={{ 'circle-radius': 20, 'circle-color': 'rgba(208,69,59,0.16)', 'circle-stroke-color': '#D0453B', 'circle-stroke-width': 2 }} />
          ) : (
            <Layer id="aqui-circulo" type="circle"
              paint={{ 'circle-radius': 7, 'circle-color': '#1F6FD1', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 }} />
          )}
        </GeoJSONSource>
        <GeoJSONSource id="pontos" data={dadosPontos} hitbox={{ top: 22, bottom: 22, left: 22, right: 22 }}
          onPress={(e) => {
            const id = e.nativeEvent.features?.[0]?.properties?.id;
            if (id) tocar(String(id));
          }}>
          <Layer id="pontos-circulo" type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'ativo'], 1], 13, 10],
              'circle-color': ['get', 'cor'],
              'circle-stroke-color': ['get', 'contorno'],
              'circle-stroke-width': ['case', ['==', ['get', 'ativo'], 1], 4, 2.5],
            }} />
          <Layer id="pontos-marca" type="symbol"
            layout={{ 'text-field': ['get', 'marca'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }}
            paint={{ 'text-color': '#FFFFFF' }} />
          <Layer id="pontos-rotulo" type="symbol"
            layout={{ 'text-field': ['get', 'rotulo'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5, 'text-offset': [0, -1.7],
              'text-anchor': 'bottom', 'text-optional': true }}
            paint={{ 'text-color': cores.texto, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 }} />
        </GeoJSONSource>
      </Map>
      <View style={s.zoom}>
        <Pressable style={s.zoomBotao} onPress={() => zoom(1)}><Icone nome="plus" tamanho={22} cor={cores.primaria} /></Pressable>
        <Pressable style={s.zoomBotao} onPress={() => zoom(-1)}><Icone nome="minus" tamanho={22} cor={cores.primaria} /></Pressable>
        <Pressable style={s.zoomBotao} onPress={() => camera.current?.fitBounds(limites, { padding: { top: 48, bottom: 48, left: 40, right: 40 }, duration: 400 })}>
          <Icone nome="fit-to-screen-outline" tamanho={20} cor={cores.primaria} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  zoom: { position: 'absolute', right: 10, top: 10, gap: 8 },
  zoomBotao: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...sombra },
});
