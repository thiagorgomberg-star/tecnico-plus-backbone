import { RobotoCondensed_400Regular, RobotoCondensed_700Bold, useFonts } from '@expo-google-fonts/roboto-condensed';
import type { Session } from '@supabase/supabase-js';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView } from 'react-native';

import { estilo } from './src/lib/estilo';
import { itensPendentes, sincronizar } from './src/lib/fila';
import { limparJornadaLocal } from './src/lib/jornada';
import { supabase } from './src/lib/supabase';
import { OrdemServico } from './src/lib/tipos';
import CameraOS from './src/telas/CameraOS';
import DetalheOS from './src/telas/DetalheOS';
import Inicio from './src/telas/Inicio';
import Login from './src/telas/Login';
import MinhaEscala from './src/telas/MinhaEscala';
import Rotas from './src/telas/Rotas';

export type Perfil = { nome: string; cargo: string | null };
type Camera = { osId: string; fotosJaFeitas: number };

export default function App() {
  const [fontesProntas] = useFonts({ RobotoCondensed_400Regular, RobotoCondensed_700Bold });
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil>({ nome: '', cargo: null });
  const [osAberta, setOsAberta] = useState<OrdemServico | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [tela, setTela] = useState<'inicio' | 'rotas' | 'escala'>('inicio');

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

  async function sair() {
    const pendentes = await itensPendentes();
    if (pendentes.length > 0) {
      return Alert.alert('Registros não enviados', `Há ${pendentes.length} registro(s) aguardando internet. Conecte-se antes de sair.`);
    }
    await limparJornadaLocal();
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

  return (
    <SafeAreaView style={estilo.tela}>
      <StatusBar style={sessao ? 'light' : 'dark'} />
      {!sessao ? (
        <Login />
      ) : osAberta ? (
        <DetalheOS os={osAberta} voltar={() => setOsAberta(null)}
          abrirCamera={(fotosJaFeitas) => setCamera({ osId: osAberta.id, fotosJaFeitas })} />
      ) : tela === 'rotas' ? (
        <Rotas voltar={() => setTela('inicio')} />
      ) : tela === 'escala' ? (
        <MinhaEscala voltar={() => setTela('inicio')} />
      ) : (
        <Inicio abrir={setTela} nome={perfil.nome} abrirOS={setOsAberta} sair={sair} />
      )}
    </SafeAreaView>
  );
}
