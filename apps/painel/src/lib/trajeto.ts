// Km rodados e paradas a partir dos pontos de GPS do dia (mesmas regras do km do relatório: km_percorridos_os).

export type PontoGps = { registrado_em: string; latitude: number; longitude: number; precisao_m?: number | null };
export type Parada = { latitude: number; longitude: number; inicio: string; fim: string; minutos: number };

const PRECISAO_MAX_M = 50; // ponto mais impreciso que isso não entra
const TRECHO_MIN_M = 25; // oscilação do GPS parado não soma
const VELOCIDADE_MAX_KMH = 180; // salto impossível é erro de GPS
const RAIO_PARADA_M = 80;
export const PARADA_MIN_MINUTOS = 10;

export function distanciaM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const bons = (pontos: PontoGps[]) => pontos.filter((p) => (p.precisao_m ?? 0) <= PRECISAO_MAX_M);

export function kmPercorridos(pontos: PontoGps[]) {
  const ps = bons(pontos);
  let m = 0;
  for (let i = 1; i < ps.length; i++) {
    const d = distanciaM(ps[i - 1], ps[i]);
    const s = (new Date(ps[i].registrado_em).getTime() - new Date(ps[i - 1].registrado_em).getTime()) / 1000;
    if (d >= TRECHO_MIN_M && (s <= 0 || (d / s) * 3.6 <= VELOCIDADE_MAX_KMH)) m += d;
  }
  return m / 1000;
}

// Parada = pontos seguidos a até 80 m do centro do grupo por 10 min ou mais (intervalo sem sinal no meio conta como parado).
export function paradas(pontos: PontoGps[]): Parada[] {
  const ps = bons(pontos);
  const lista: Parada[] = [];
  let grupo: PontoGps[] = [];
  const centro = () => ({
    latitude: grupo.reduce((t, p) => t + p.latitude, 0) / grupo.length,
    longitude: grupo.reduce((t, p) => t + p.longitude, 0) / grupo.length,
  });
  const fechar = () => {
    if (grupo.length < 2) return;
    const inicio = grupo[0].registrado_em, fim = grupo[grupo.length - 1].registrado_em;
    const minutos = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
    if (minutos >= PARADA_MIN_MINUTOS) lista.push({ ...centro(), inicio, fim, minutos });
  };
  for (const p of ps) {
    if (grupo.length && distanciaM(centro(), p) > RAIO_PARADA_M) {
      fechar();
      grupo = [];
    }
    grupo.push(p);
  }
  fechar();
  return lista;
}

export const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);
export const fmtKm = (km: number) => `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
