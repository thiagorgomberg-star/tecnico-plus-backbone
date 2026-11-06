import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import AnaliseSor from '../componentes/AnaliseSor';
import ComparaCurvas, { CurvaMarcada } from '../componentes/ComparaCurvas';
import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, estilo } from '../lib/estilo';
import { Momento, ROTULO_MOMENTO, ROTULO_SENTIDO, Sentido } from '../lib/comparaSor';
import { lerSor } from '../lib/sor';

// Curvas que o técnico analisa no próprio celular: não vão para o servidor nem para nenhuma rota.
// Ficam guardadas até o técnico apagar pela lixeira (com dupla confirmação).
// fibra/sentido/momento marcam a curva para o comparativo (A → B × B → A ou antes × depois).
type Guardada = { arquivo: string; nome: string; em: string; fibra?: string; sentido?: Sentido | ''; momento?: Momento };
const CHAVE = 'minhas-curvas';
const pasta = () => new Directory(Paths.document, 'minhas-curvas');

export default function AnalisarCurva({ voltar }: { voltar: () => void }) {
  const [lista, setLista] = useState<Guardada[]>([]);
  const [aberta, setAberta] = useState<{ nome: string; uri: string } | null>(null);
  // Modo de seleção para comparar: marca as curvas e abre o comparativo.
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [comparando, setComparando] = useState(false);
  const paraComparar: CurvaMarcada[] = lista.filter((g) => marcadas.includes(g.arquivo)).map((g) => ({
    chave: g.arquivo, nome: g.nome, uri: new File(pasta(), g.arquivo).uri, fibra: g.fibra ?? '', sentido: g.sentido ?? '', momento: g.momento ?? '',
  }));
  const listaAtual = useRef(lista);
  listaAtual.current = lista;
  function marcar(chave: string, m: Partial<Pick<CurvaMarcada, 'fibra' | 'sentido' | 'momento'>>) {
    salvar(listaAtual.current.map((g) => (g.arquivo === chave ? { ...g, ...m } : g)));
  }

  useEffect(() => {
    AsyncStorage.getItem(CHAVE).then((c) => c && setLista((JSON.parse(c) as Guardada[]).filter((g) => new File(pasta(), g.arquivo).exists)));
  }, []);

  async function salvar(nova: Guardada[]) {
    listaAtual.current = nova;
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
    await salvar(nova);
    setAberta({ nome, uri: destino.uri });
  }

  function apagar(g: Guardada) {
    const excluir = () => {
      const f = new File(pasta(), g.arquivo);
      if (f.exists) f.delete();
      salvar(lista.filter((x) => x.arquivo !== g.arquivo));
    };
    Alert.alert('Apagar curva?', g.nome, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => Alert.alert(
        'Confirma de novo?', 'A curva será apagada deste celular e não dá para recuperar.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sim, apagar', style: 'destructive', onPress: excluir },
        ]) },
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
              As curvas ficam guardadas aqui até você apagar na lixeira.
            </Text>
            {lista.length > 1 ? (
              <Pressable style={[s.botao, s.botaoSec]} onPress={() => (selecionando && marcadas.length >= 2 ? setComparando(true) : setSelecionando(!selecionando))}>
                <Icone nome="compare-horizontal" tamanho={22} cor={cores.primaria} />
                <Text style={[s.botaoTexto, { color: cores.primaria }]}>
                  {!selecionando ? 'Comparar curvas' : marcadas.length >= 2 ? `Comparar ${marcadas.length} curvas` : 'Marque 2 ou mais curvas'}
                </Text>
              </Pressable>
            ) : null}
            {selecionando ? (
              <Pressable onPress={() => { setSelecionando(false); setMarcadas([]); }} hitSlop={8}><Text style={s.cancelar}>Cancelar seleção</Text></Pressable>
            ) : null}
            {lista.length ? <Text style={s.secao}>MINHAS CURVAS ({lista.length})</Text> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={[estilo.cartao, s.linha]} onPress={() => (selecionando
            ? setMarcadas((m) => (m.includes(item.arquivo) ? m.filter((x) => x !== item.arquivo) : [...m, item.arquivo]))
            : setAberta({ nome: item.nome, uri: new File(pasta(), item.arquivo).uri }))}>
            <Icone nome={selecionando ? (marcadas.includes(item.arquivo) ? 'checkbox-marked' : 'checkbox-blank-outline') : 'file-chart'} cor={cores.primaria} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: cores.texto, fontWeight: '700' }} numberOfLines={1}>{item.nome}</Text>
              <Text style={estilo.suave}>
                {new Date(item.em).toLocaleString('pt-BR')}
                {[item.fibra && `fibra ${item.fibra}`, item.sentido && ROTULO_SENTIDO[item.sentido], item.momento && ROTULO_MOMENTO[item.momento]].filter(Boolean).map((t) => ` · ${t}`).join('')}
              </Text>
            </View>
            {selecionando ? null : <Pressable hitSlop={10} onPress={() => apagar(item)}><Icone nome="trash-can-outline" cor={cores.suave} /></Pressable>}
          </Pressable>
        )}
      />
      <ComparaCurvas curvas={comparando ? paraComparar : null} aoMudar={marcar} fechar={() => setComparando(false)}
        analisarSozinha={(c) => { setComparando(false); setAberta({ nome: c.nome, uri: c.uri }); }} />
      <AnaliseSor curva={aberta} extensaoKm={null} fechar={() => setAberta(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: cores.primaria, borderRadius: 14, height: 52, margin: 16, marginBottom: 8 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '800' },
  botaoSec: { backgroundColor: cores.cartao, borderWidth: 1.5, borderColor: cores.primaria, marginTop: 4 },
  cancelar: { color: cores.suave, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  aviso: { fontSize: 12.5, color: cores.suave, marginHorizontal: 16, lineHeight: 18 },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginHorizontal: 16, marginTop: 16 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
