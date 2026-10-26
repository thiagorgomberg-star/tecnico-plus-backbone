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

// Posição para início/fim de expediente sem deixar o técnico esperando: usa a última posição recente
// do celular; senão tenta uma leitura nova por no máximo `limiteMs`; senão a última conhecida (ou null).
export async function posicaoRapida(limiteMs = 4000) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const recente = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 150 }).catch(() => null);
  if (recente) return recente.coords;
  const nova = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((p) => p.coords).catch(() => null);
  const limite = new Promise<null>((ok) => setTimeout(() => ok(null), limiteMs));
  const pos = await Promise.race([nova, limite]);
  if (pos) return pos;
  return (await Location.getLastKnownPositionAsync().catch(() => null))?.coords ?? null;
}

const SEM_NOME = /sem nome|sem denomina|unnamed|^\s*$/i;

// Endereço a partir das coordenadas. Precisa de internet: offline (ou demorando) devolve null.
export async function enderecoDe(latitude: number, longitude: number, limiteMs = 2500) {
  try {
    const consulta = Location.reverseGeocodeAsync({ latitude, longitude });
    const limite = new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo')), limiteMs));
    const [r] = await Promise.race([consulta, limite]);
    if (!r) return null;
    const cidade = r.city ?? r.subregion;
    // O Google devolve "Estrada sem nome" / "Unnamed Road" quando não conhece a via: aí vai só a cidade.
    if (!r.street || SEM_NOME.test(r.street)) {
      return cidade ? cidade + (r.region ? ` - ${r.region}` : '') : null;
    }
    const rua = [r.street, r.streetNumber].filter(Boolean).join(', ');
    const bairro = r.district && !SEM_NOME.test(r.district) ? r.district : null;
    return [rua, bairro, cidade].filter(Boolean).join(' - ') +
      (r.region ? ` - ${r.region}` : '') + (r.postalCode ? `, ${r.postalCode}` : '');
  } catch {
    return null;
  }
}
