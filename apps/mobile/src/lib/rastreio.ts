import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { verificarAlertas } from './avisos';
import { enfileirar } from './fila';
import { lerJornada } from './jornada';

// Rastreio do dia: roda em segundo plano (notificação fixa no Android) do início ao fim do expediente.
// Cada lote de posições vai para a fila e sobe quando houver internet.
const TAREFA = 'rastreio-expediente';
let ultimaVerificacao = 0;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREFA, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const jornada = await lerJornada();
  if (!jornada.expedienteId) return;
  let bateria: number | null = null;
  try {
    bateria = Math.round((await Battery.getBatteryLevelAsync()) * 100);
  } catch {
    // sem leitura de bateria
  }
  await enfileirar({
    tipo: 'inserirVarios',
    tabela: 'posicoes_gps',
    linhas: data.locations.map((l) => ({
      expediente_id: jornada.expedienteId,
      registrado_em: new Date(l.timestamp).toISOString(),
      posicao: `SRID=4326;POINT(${l.coords.longitude} ${l.coords.latitude})`,
      precisao_m: l.coords.accuracy,
      velocidade_kmh: l.coords.speed != null && l.coords.speed >= 0 ? Math.round(l.coords.speed * 3.6) : null,
      bateria_pct: bateria,
    })),
  });
  // Aproveita que o app acordou em segundo plano para tocar alertas novos (no máximo 1x por minuto;
  // com o app aberto o tempo real já avisa na hora).
  if (Date.now() - ultimaVerificacao < 60_000) return;
  ultimaVerificacao = Date.now();
  await verificarAlertas();
});

// Pede "permitir o tempo todo"; sem isso o trajeto só é gravado com o app aberto.
export async function iniciarRastreio() {
  const primeiroPlano = await Location.requestForegroundPermissionsAsync();
  if (primeiroPlano.status !== 'granted') return false;
  const segundoPlano = await Location.requestBackgroundPermissionsAsync();
  if (segundoPlano.status !== 'granted') return false;
  // Reinicia sempre: depois de encerrar e abrir outro expediente o serviço antigo pode ter ficado parado.
  if (await Location.hasStartedLocationUpdatesAsync(TAREFA)) await Location.stopLocationUpdatesAsync(TAREFA);
  await Location.startLocationUpdatesAsync(TAREFA, {
    accuracy: Location.Accuracy.High,
    // Um ponto por minuto mesmo parado (com distância mínima o Android só manda posição em movimento).
    timeInterval: 60_000,
    distanceInterval: 0,
    deferredUpdatesInterval: 60_000,
    foregroundService: {
      notificationTitle: 'Técnico Plus: expediente em andamento',
      notificationBody: 'Seu trajeto está sendo registrado até encerrar o expediente.',
      notificationColor: '#0572CE',
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function pararRastreio() {
  if (await Location.hasStartedLocationUpdatesAsync(TAREFA)) {
    await Location.stopLocationUpdatesAsync(TAREFA);
  }
}
