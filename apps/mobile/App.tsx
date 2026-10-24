import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

import { cores, estilo } from './src/lib/estilo';
import { supabase } from './src/lib/supabase';
import { OrdemServico } from './src/lib/tipos';
import DetalheOS from './src/telas/DetalheOS';
import Inicio from './src/telas/Inicio';
import Login from './src/telas/Login';

export default function App() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [nome, setNome] = useState('');
  const [osAberta, setOsAberta] = useState<OrdemServico | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) return;
    supabase
      .from('usuarios')
      .select('nome')
      .eq('id', sessao.user.id)
      .single()
      .then(({ data }) => setNome(data?.nome ?? ''));
  }, [sessao]);

  return (
    <SafeAreaView style={estilo.tela}>
      <StatusBar style="dark" />
      {!sessao ? (
        <Login />
      ) : osAberta ? (
        <DetalheOS os={osAberta} voltar={() => setOsAberta(null)} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, paddingBottom: 0 }}>
            <Text style={[estilo.titulo, { fontSize: 22 }]}>Técnico Plus</Text>
            <Pressable onPress={() => supabase.auth.signOut()}>
              <Text style={{ color: cores.primaria }}>Sair</Text>
            </Pressable>
          </View>
          <Inicio nome={nome} abrirOS={setOsAberta} />
        </View>
      )}
    </SafeAreaView>
  );
}
