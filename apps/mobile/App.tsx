import { RobotoCondensed_400Regular, RobotoCondensed_700Bold, useFonts } from '@expo-google-fonts/roboto-condensed';
import type { Session } from '@supabase/supabase-js';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, AppState, BackHandler, SafeAreaView, View } from 'react-native';

import AbasInferiores, { Aba } from './src/componentes/AbasInferiores';
import { cores, estilo } from './src/lib/estilo';
import { aoMudarFila, itensPendentes, sincronizar } from './src/lib/fila';
import { limparJornadaLocal } from './src/lib/jornada';
import { supabase } from './src/lib/supabase';
import { esquecerDispositivo, ouvirAlertas, ouvirTrocaDeToken, prepararAvisos, registrarDispositivo, verificarAlertas } from './src/lib/avisos';
import { OrdemServico } from './src/lib/tipos';
import CameraOS from './src/telas/CameraOS';
import DetalheOS from './src/telas/DetalheOS';
import Estoque from './src/telas/Estoque';
import Atividades from './src/telas/Atividades';
import Login from './src/telas/Login';
import Mais from './src/telas/Mais';
import MinhaEscala from './src/telas/MinhaEscala';
import NovaPreventiva from './src/telas/NovaPreventiva';
import Rotas from './src/telas/Rotas';

export type Perfil = { nome: string; cargo: string | null };
type Camera = { osId: string; fotosJaFeitas: number };

export default function App() {
  const [fontesProntas] = useFonts({ RobotoCondensed_400Regular, RobotoCondensed_700Bold });
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil>({ nome: '', cargo: null });
  const [osAberta, setOsAberta] = useState<OrdemServico | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [tela, setTela] = useState<'inicio' | 'rotas' | 'escala' | 'preventiva'>('inicio');
  const [aba, setAba] = useState<Aba>('atividades');
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const contar = () => itensPendentes().then((i) => setPendentes(i.length));
    contar();
    return aoMudarFila(contar);
  }, []);

  // Botão voltar do Android fecha a tela aberta em vez de sair do app.
  useEffect(() => {
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      if (camera) return false;
      if (osAberta) { setOsAberta(null); return true; }
      if (tela !== 'inicio') { setTela('inicio'); return true; }
      if (aba !== 'atividades') { setAba('atividades'); return true; }
      return false;
    });
    return () => assinatura.remove();
  }, [osAberta, tela, aba, camera]);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) return;
    sincronizar();
    supabase
      .from('usuarios')
      .select('nome, cargo')
      .eq('id', sessao.user.id)
      .single()
      .then(({ data }) => data && setPerfil(data));
  }, [sessao]);

  // Avisos de O.S.: tempo real com o app aberto e ao voltar para o app.
  useEffect(() => {
    if (!sessao) return;
    prepararAvisos().then(() => {
      verificarAlertas();
      registrarDispositivo();
    });
    const pararTrocaToken = ouvirTrocaDeToken();
    const pararDeOuvir = ouvirAlertas(sessao.user.id);
    const aoVoltar = AppState.addEventListener('change', (estado) => estado === 'active' && verificarAlertas());
    // Tocar na notificação abre a O.S.
    const abrirDaNotificacao = async (resposta: Notifications.NotificationResponse | null) => {
      const osId = resposta?.notification.request.content.data?.osId as string | undefined;
      if (!osId) return;
      const { data } = await supabase.from('ordens_servico').select('*').eq('id', osId).maybeSingle();
      if (data) setOsAberta(data);
    };
    const aoTocar = Notifications.addNotificationResponseReceivedListener(abrirDaNotificacao);
    // App estava fechado e foi aberto pelo toque na notificação.
    Notifications.getLastNotificationResponseAsync().then(abrirDaNotificacao);
    return () => {
      pararTrocaToken();
      pararDeOuvir();
      aoVoltar.remove();
      aoTocar.remove();
    };
  }, [sessao]);

  async function sair() {
    const pendentes = await itensPendentes();
    if (pendentes.length > 0) {
      return Alert.alert('Registros não enviados', `Há ${pendentes.length} registro(s) aguardando internet. Conecte-se antes de sair.`);
    }
    await limparJornadaLocal();
    await esquecerDispositivo();
    await supabase.auth.signOut();
  }

  if (!fontesProntas) return null;

  if (sessao && camera) {
    return (
      <>
        <StatusBar hidden />
        <CameraOS osId={camera.osId} fotosJaFeitas={camera.fotosJaFeitas} minimo={10} usuario={perfil}
          fechar={() => setCamera(null)} />
      </>
    );
  }

  if (!sessao) {
    return (
      <SafeAreaView style={estilo.tela}>
        <StatusBar style="dark" />
        <Login />
      </SafeAreaView>
    );
  }

  const euId = sessao.user.id;
  let conteudo;
  if (osAberta) {
    conteudo = (
      <DetalheOS os={osAberta} euId={euId} voltar={() => setOsAberta(null)}
        usuario={perfil}
        abrirCamera={(fotosJaFeitas) => setCamera({ osId: osAberta.id, fotosJaFeitas })} />
    );
  } else if (tela === 'rotas') {
    conteudo = <Rotas voltar={() => setTela('inicio')} />;
  } else if (tela === 'preventiva') {
    conteudo = <NovaPreventiva voltar={() => setTela('inicio')} abrirOS={(os) => { setTela('inicio'); setAba('atividades'); setOsAberta(os); }} />;
  } else if (tela === 'escala') {
    conteudo = <MinhaEscala voltar={() => setTela('inicio')} />;
  } else {
    conteudo = (
      <>
        <View style={{ flex: 1 }}>
          {aba === 'atividades' ? <Atividades nome={perfil.nome} abrirOS={setOsAberta} /> : null}
          {aba === 'estoque' ? <Estoque euId={euId} /> : null}
          {aba === 'mais' ? <Mais nome={perfil.nome} cargo={perfil.cargo} pendentes={pendentes} abrir={setTela} sair={sair} /> : null}
        </View>
        <AbasInferiores atual={aba} mudar={setAba} avisos={{ mais: pendentes }} />
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: cores.cabecalho }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: cores.fundo }}>{conteudo}</View>
    </SafeAreaView>
  );
}
