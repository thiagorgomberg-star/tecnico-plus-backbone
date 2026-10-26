import type { ReactNode } from 'react';

type LatLng = { lat: number; lng: number };
export type PontoMapa = LatLng & { id: string; cor: string; rotulo: string; ativo?: boolean; marca?: string; contorno?: string };
export type LinhaMapa = { id: string; de: LatLng; para: LatLng; cor: string; tracejada?: boolean };

// Na web (prévias) não há mapa nativo: usa o desenho próprio do app.
export default function MapaVetorial({ reserva }: { reserva: ReactNode } & Record<string, unknown>) {
  return <>{reserva}</>;
}
