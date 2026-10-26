// Na versão web (prévias) não há mapa nativo: os mapas usam o desenho próprio do app.
export const ESTILO_MAPA = '';
export const mapaNativoDisponivel = false;
export async function baixarMapaOffline(_pontos: { lat: number; lng: number }[]) {}
