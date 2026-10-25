import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import AnaliseSor from '../componentes/AnaliseSor';
import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, estilo } from '../lib/estilo';
import { lerSor } from '../lib/sor';

// Curvas que o técnico analisa no próprio celular: não vão para o servidor nem para nenhuma rota.
// Ficam só as 5 últimas; a 6ª apaga a mais antiga.
type Guardada = { arquivo: string; nome: string; em: string };
const CHAVE = 'minhas-curvas';
const LIMITE = 5;
const pasta = () => new Directory(Paths.document, 'minhas-curvas');

export default function AnalisarCurva({ voltar }: { voltar: () => void }) {
  const [lista, setLista] = useState<Guardada[]>([]);
  const [aberta, setAberta] = useState<{ nome: string; uri: string } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CHAVE).then((c) => c && setLista((JSON.parse(c) as Guardada[]).filter((g) => new File(pasta(), g.arquivo).exists)));
  }, []);

  async function salvar(nova: Guardada[]) {
    setLista(nova);
    await AsyncStorage.setItem(CHAVE, JSON.stringify(nova));
  }

  async function escolher() {
    // O seletor de arquivos só existe a partir do APK novo; nos antigos avisa.
    if (!requireOptionalNativeModule('ExpoDocumentPicker')) {
      return Alert.alert('Atualize o app', 'Para analisar curvas do celular é preciso instalar a versão nova do APK.');
    }
    const Seletor: typeof import('expo-document-picker') = require('expo-document-picker');
    const r = await Seletor.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const origem = new File(a.uri);
    let nome = a.name;
    let bytes: Uint8Array;
    try {
      bytes = await origem.bytes();
      const sor = lerSor(bytes);
      // Sem o nome original, identifica pela própria curva (cabo, fibra, onda e data).
      if (!/\.sor$/i.test(a.name)) {
        nome = [sor.cabo, sor.fibra, `${sor.comprimentoOndaNm} nm`, sor.data?.toLocaleDateString('pt-BR')].filter(Boolean).join(' · ') || a.name;
      }
    } catch {
      // O Android às vezes entrega o arquivo sem a extensão (ex.: "Documento"), então vale o conteúdo, não o nome.
      return Alert.alert('Arquivo não aceito', 'Este arquivo não é uma curva .SOR. Escolha o arquivo exportado do OTDR.');
    }
    if (!pasta().exists) pasta().create({ intermediates: true });
    const destino = new File(pasta(), `${Date.now()}_${a.name.replace(/[^\w.-]+/g, '_')}`);
    destino.write(bytes);
    const nova = [{ arquivo: destino.name, nome, em: new Date().toISOString() }, ...lista];
    for (const velha of nova.slice(LIMITE)) {
      const f = new File(pasta(), velha.arquivo);
      if (f.exists) f.delete();
    }
    await salvar(nova.slice(0, LIMITE));
    setAberta({ nome, uri: destino.uri });
  }

  function apagar(g: Guardada) {
    Alert.alert('Apagar curva?', g.nome, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => {
        const f = new File(pasta(), g.arquivo);
        if (f.exists) f.delete();
        salvar(lista.filter((x) => x.arquivo !== g.arquivo));
      } },
    ]);
  }

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Analisar curva OTDR" subtitulo="Funciona sem internet" voltar={voltar} />
      <FlatList
        data={lista}
        keyExtractor={(g) => g.arquivo}
        ListHeaderComponent={(
          <View>
            <Pressable style={s.botao} onPress={escolher}>
              <Icone nome="chart-bell-curve" tamanho={22} cor="#fff" />
              <Text style={s.botaoTexto}>Escolher arquivo .SOR</Text>
            </Pressable>
            <Text style={s.aviso}>
              A análise é feita no próprio celular e a curva não é enviada ao sistema nem ligada a nenhuma rota.
              Ficam guardadas só as {LIMITE} últimas: a próxima apaga a mais antiga.
            </Text>
            {lista.length ? <Text style={s.secao}>ÚLTIMAS CURVAS ({lista.length}/{LIMITE})</Text> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={[estilo.cartao, s.linha]} onPress={() => setAberta({ nome: item.nome, uri: new File(pasta(), item.arquivo).uri })}>
            <Icone nome="file-chart" cor={cores.primaria} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: cores.texto, fontWeight: '700' }} numberOfLines={1}>{item.nome}</Text>
              <Text style={estilo.suave}>{new Date(item.em).toLocaleString('pt-BR')}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => apagar(item)}><Icone nome="trash-can-outline" cor={cores.suave} /></Pressable>
          </Pressable>
        )}
      />
      <AnaliseSor curva={aberta} extensaoKm={null} fechar={() => setAberta(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: cores.primaria, borderRadius: 14, height: 52, margin: 16, marginBottom: 8 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '800' },
  aviso: { fontSize: 12.5, color: cores.suave, marginHorizontal: 16, lineHeight: 18 },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginHorizontal: 16, marginTop: 16 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
