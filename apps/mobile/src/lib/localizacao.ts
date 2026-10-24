import * as Location from 'expo-location';

// Posição atual, ou null se o técnico negar a permissão.
export async function posicaoAtual() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return coords;
}

// Endereço a partir das coordenadas. Precisa de internet: offline (ou demorando) devolve null.
export async function enderecoDe(latitude: number, longitude: number, limiteMs = 2500) {
  try {
    const consulta = Location.reverseGeocodeAsync({ latitude, longitude });
    const limite = new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo')), limiteMs));
    const [r] = await Promise.race([consulta, limite]);
    if (!r) return null;
    const rua = [r.street, r.streetNumber].filter(Boolean).join(', ');
    return [rua, r.district, r.city ?? r.subregion].filter(Boolean).join(' - ') +
      (r.region ? ` - ${r.region}` : '') + (r.postalCode ? `, ${r.postalCode}` : '');
  } catch {
    return null;
  }
}
