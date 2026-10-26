import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) Alert.alert('Não foi possível entrar', 'Confira o e-mail e a senha.');
  }

  return (
    <View style={[estilo.tela, { justifyContent: 'center', padding: 24 }]}>
      <Text style={[estilo.titulo, { fontSize: 26 }]}>Técnico Plus</Text>
      <Text style={[estilo.suave, { marginBottom: 24 }]}>Backbone Multivale</Text>
      <TextInput placeholderTextColor={cores.apagado}
        style={estilo.campo}
        placeholder="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput placeholderTextColor={cores.apagado}
        style={estilo.campo}
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />
      <Pressable style={estilo.botao} onPress={entrar} disabled={entrando}>
        {entrando ? <ActivityIndicator color="#fff" /> : <Text style={estilo.botaoTexto}>Entrar</Text>}
      </Pressable>
      <Text style={[estilo.suave, { marginTop: 16, color: cores.suave }]}>
        O acesso é criado pelo supervisor.
      </Text>
    </View>
  );
}
