import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Avisos no celular (nova O.S., SLA perto de vencer, SLA vencido).
// O app busca os alertas ainda não avisados e toca uma notificação para cada um.
// Roda com o app aberto (tempo real) e em segundo plano junto com o rastreio do expediente.

const CANAL = 'alertas-os';
// Nova O.S., O.S. reaberta e ocorrência perto: toque de alarme próprio (o som de um canal do Android não muda depois de criado,
// por isso é um canal novo).
const CANAL_ALARME = 'alarme-os';
const SOM_ALARME = 'alarme_os.wav';
const COM_ALARME = ['nova_os', 'os_reaberta', 'backlog_proximo', 'apoio_os'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const titulos: Record<string, string> = {
  nova_os: 'Nova O.S. recebida',
  prazo_proximo: 'SLA perto de vencer',
  os_atrasada: 'SLA vencido',
  encerrar_jornada: 'Lembrete de jornada',
  os_visualizada: 'O.S. visualizada',
  pausa_solicitada: 'Pedido de pausa',
  backlog_proximo: 'Ocorrência perto de você',
  os_reaberta: 'O.S. reaberta',
  apoio_os: 'Você é apoio numa O.S.',
  os_retirada: 'O.S. retirada de você',
  expediente_encerrado: 'Expediente encerrado pelo supervisor',
};

// Registra o token do Firebase deste celular para o usuário logado: o servidor manda a notificação
// mesmo com o app fechado. Sem internet, tenta de novo na próxima abertura.
export async function registrarDispositivo() {
  if (Platform.OS !== 'android') return;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data === 'string' && data) await supabase.rpc('registrar_dispositivo', { p_token: data });
  } catch {
    // sem Google Play Services ou sem internet
  }
}

// Ao sair, este celular deixa de receber os avisos do usuário.
export async function esquecerDispositivo() {
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data === 'string' && data) await supabase.from('dispositivos_push').delete().eq('token', data);
  } catch {
    // ignora
  }
}

export function ouvirTrocaDeToken() {
  const assinatura = Notifications.addPushTokenListener(({ data }) => {
    if (typeof data === 'string' && data) supabase.rpc('registrar_dispositivo', { p_token: data });
  });
  return () => assinatura.remove();
}

export async function prepararAvisos() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Ordens de serviço',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#0572CE',
    });
    await Notifications.setNotificationChannelAsync(CANAL_ALARME, {
      name: 'Nova O.S. (alarme)',
      importance: Notifications.AndroidImportance.MAX,
      sound: SOM_ALARME,
      vibrationPattern: [0, 600, 250, 600, 250, 600],
      lightColor: '#0572CE',
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    });
  }
  const atual = await Notifications.getPermissionsAsync();
  if (!atual.granted) await Notifications.requestPermissionsAsync();
}

let verificando = false;

// Marca como avisados (de forma atômica, para não tocar duas vezes) e mostra cada alerta novo.
export async function verificarAlertas() {
  if (verificando) return;
  verificando = true;
  try {
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao.session?.user.id;
    if (!usuario) return;
    const { data } = await supabase
      .from('alertas')
      .update({ enviado_push_em: new Date().toISOString() })
      .eq('usuario_id', usuario)
      .is('enviado_push_em', null)
      .gte('criado_em', new Date(Date.now() - 24 * 3600_000).toISOString())
      .select('id, tipo, mensagem, os_id');
    for (const alerta of data ?? []) {
      const alarme = COM_ALARME.includes(alerta.tipo);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: titulos[alerta.tipo] ?? 'Técnico Plus',
          body: alerta.mensagem,
          data: { osId: alerta.os_id },
          sound: alarme ? SOM_ALARME : 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: Platform.OS === 'android' ? { channelId: alarme ? CANAL_ALARME : CANAL } : null,
      });
    }
  } catch {
    // sem internet: tenta de novo na próxima vez
  } finally {
    verificando = false;
  }
}

// Tempo real enquanto o app está aberto.
export function ouvirAlertas(usuarioId: string) {
  const canal = supabase
    .channel('meus-alertas')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas', filter: `usuario_id=eq.${usuarioId}` }, () => {
      verificarAlertas();
    })
    .subscribe();
  return () => {
    supabase.removeChannel(canal);
  };
}

// Som do aviso de O.S. nova na tela: se a notificação dessa O.S. já tocou (push), não repete;
// senão (ex.: chegou enquanto estava sem sinal), toca uma notificação com o alarme.
export async function tocarAvisoOS(osId: string, titulo: string, corpo: string) {
  try {
    const presentes = await Notifications.getPresentedNotificationsAsync();
    if (presentes.some((n) => (n.request.content.data as { osId?: string } | null)?.osId === osId)) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: corpo, data: { osId }, sound: SOM_ALARME, priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: Platform.OS === 'android' ? { channelId: CANAL_ALARME } : null,
    });
  } catch {
    // sem permissão de notificação: fica só a vibração
  }
}
