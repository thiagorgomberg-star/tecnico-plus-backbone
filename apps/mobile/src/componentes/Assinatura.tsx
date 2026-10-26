import { ComponentRef, useRef, useState } from 'react';
import { Alert, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { cores } from '../lib/estilo';
import { salvarMinhaAssinatura } from '../lib/assinatura';
import MargemInferior from './MargemInferior';

// Cadastro da assinatura do técnico: desenhada uma vez no dedo e reaproveitada em todas as O.S. (botão "Assinar O.S.").
export default function Assinatura({ aberta, fechar, aoSalvar }: { aberta: boolean; fechar: () => void; aoSalvar: () => void }) {
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
    if (tracos.length === 0) return Alert.alert('Assine no quadro');
    try {
      await salvarMinhaAssinatura(await captureRef(quadro, { format: 'jpg', quality: 0.9 }));
      setTracos([]);
      fechar();
      aoSalvar();
    } catch (e) {
      Alert.alert('Erro ao salvar a assinatura', String(e));
    }
  }

  return (
    <Modal visible={aberta} onRequestClose={fechar} animationType="slide">
      <View style={s.tela}>
        <Text style={s.titulo}>Sua assinatura</Text>
        <Text style={s.ajuda}>Assine uma vez. Depois é só tocar em "Assinar O.S." em cada atendimento.</Text>
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
      <MargemInferior />
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, padding: 16, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.texto, marginTop: 8 },
  ajuda: { fontSize: 14, color: cores.suave },
  quadro: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  dica: { color: '#BBB', fontSize: 22 },
  botao: { flex: 1, borderRadius: 6, paddingVertical: 14, alignItems: 'center' },
  secundario: { backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
