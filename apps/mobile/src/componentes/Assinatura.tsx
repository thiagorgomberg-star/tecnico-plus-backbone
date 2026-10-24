import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { ComponentRef, useRef, useState } from 'react';
import { Alert, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { cores } from '../lib/estilo';
import { enfileirar } from '../lib/fila';

// Assinatura do responsável no local: nome + traço no dedo. Vira imagem e vai pela fila (funciona offline).
export default function Assinatura({ osId, aberta, fechar, aoSalvar }: {
  osId: string; aberta: boolean; fechar: () => void; aoSalvar: (nome: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [tracos, setTracos] = useState<string[]>([]);
  const atual = useRef('');
  const [, redesenhar] = useState(0);
  const quadro = useRef<ComponentRef<typeof View>>(null);

  const gesto = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      atual.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
      redesenhar((v) => v + 1);
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      atual.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      redesenhar((v) => v + 1);
    },
    onPanResponderRelease: () => {
      const traco = atual.current;
      atual.current = '';
      if (traco) setTracos((t) => [...t, traco]);
    },
  })).current;

  async function salvar() {
    if (!nome.trim()) return Alert.alert('Informe o nome de quem assina');
    if (tracos.length === 0) return Alert.alert('Peça para a pessoa assinar no quadro');
    try {
      const temporario = await captureRef(quadro, { format: 'jpg', quality: 0.9 });
      const pasta = new Directory(Paths.document, 'fotos');
      if (!pasta.exists) pasta.create();
      const destino = new File(pasta, `${randomUUID()}.jpg`);
      new File(temporario).move(destino);
      await enfileirar({
        tipo: 'foto', osId, tipoAnexo: 'assinatura', arquivo: destino.uri, largura: 0, altura: 0,
        tiradaEm: new Date().toISOString(), latitude: null, longitude: null, descricao: nome.trim(),
      });
      aoSalvar(nome.trim());
      setTracos([]);
      setNome('');
      fechar();
    } catch (e) {
      Alert.alert('Erro ao salvar a assinatura', String(e));
    }
  }

  return (
    <Modal visible={aberta} onRequestClose={fechar} animationType="slide">
      <View style={s.tela}>
        <Text style={s.titulo}>Assinatura do responsável</Text>
        <TextInput style={s.campo} placeholder="Nome de quem assina" value={nome} onChangeText={setNome} />
        <View ref={quadro} collapsable={false} style={s.quadro} {...gesto.panHandlers}>
          <Svg style={StyleSheet.absoluteFill}>
            {[...tracos, atual.current].filter(Boolean).map((d, i) => (
              <Path key={i} d={d} stroke="#111" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
          {tracos.length === 0 && !atual.current ? <Text style={s.dica}>Assine aqui</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={[s.botao, s.secundario]} onPress={fechar}><Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text></Pressable>
          <Pressable style={[s.botao, s.secundario]} onPress={() => setTracos([])}><Text style={[s.botaoTexto, { color: cores.texto }]}>Limpar</Text></Pressable>
          <Pressable style={[s.botao, { backgroundColor: cores.sucesso }]} onPress={salvar}><Text style={s.botaoTexto}>Salvar</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, padding: 16, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.texto, marginTop: 8 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  quadro: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  dica: { color: '#BBB', fontSize: 22 },
  botao: { flex: 1, borderRadius: 6, paddingVertical: 14, alignItems: 'center' },
  secundario: { backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
