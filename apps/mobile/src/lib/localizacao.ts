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
