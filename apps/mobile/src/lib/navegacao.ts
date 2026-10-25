import { Alert, Linking } from 'react-native';

// Abre a navegação até um ponto (coordenada) ou endereço, deixando o técnico escolher Google Maps ou Waze.
export type Destino = { lat?: number | null; lng?: number | null; endereco?: string | null };

const temPonto = (d: Destino) => d.lat != null && d.lng != null;

export function linkGoogle(d: Destino) {
  const alvo = temPonto(d) ? `${d.lat},${d.lng}` : encodeURIComponent(d.endereco ?? '');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=${alvo}`;
}

export function linkWaze(d: Destino) {
  return temPonto(d) ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(d.endereco ?? '')}&navigate=yes`;
}

export function navegarAte(d: Destino, titulo = 'Como chegar') {
  if (!temPonto(d) && !d.endereco) return Alert.alert('Sem localização', 'Esta O.S. não tem endereço nem ponto no mapa.');
  Alert.alert(titulo, 'Escolha o aplicativo de navegação.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Waze', onPress: () => Linking.openURL(linkWaze(d)) },
    { text: 'Google Maps', onPress: () => Linking.openURL(linkGoogle(d)) },
  ]);
}

// Distância em linha reta (km) entre dois pontos.
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
