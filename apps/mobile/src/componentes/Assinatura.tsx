import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ComponentRef, useEffect, useRef, useState } from 'react';
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
  // Área usada pelos traços (em pontos da tela), para recortar só a assinatura e ela sair grande no documento.
  const limites = useRef({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const largura = useRef(0);
  const marcar = (x: number, y: number) => {
    const l = limites.current;
    limites.current = { x0: Math.min(l.x0, x), y0: Math.min(l.y0, y), x1: Math.max(l.x1, x), y1: Math.max(l.y1, y) };
  };

  // Celular deitado enquanto assina: quadro largo, assinatura maior.
  useEffect(() => {
    if (!aberta) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); };
  }, [aberta]);

  function limpar() {
    setTracos([]);
    limites.current = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  }

  const gesto = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      atual.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
      marcar(x, y);
      redesenhar((v) => v + 1);
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      atual.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      marcar(x, y);
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
      const inteira = await captureRef(quadro, { format: 'jpg', quality: 0.95 });
      const info = await manipulateAsync(inteira, []);
      const escala = largura.current ? info.width / largura.current : 1;
      const l = limites.current;
      const folga = 10;
      const x = Math.max(0, Math.floor((l.x0 - folga) * escala));
      const y = Math.max(0, Math.floor((l.y0 - folga) * escala));
      const w = Math.min(info.width - x, Math.ceil((l.x1 - l.x0 + 2 * folga) * escala));
      const h = Math.min(info.height - y, Math.ceil((l.y1 - l.y0 + 2 * folga) * escala));
      const recortada = Number.isFinite(l.x0) && w > 20 && h > 20
        ? (await manipulateAsync(inteira, [{ crop: { originX: x, originY: y, width: w, height: h } }], { compress: 0.95, format: SaveFormat.JPEG })).uri
        : inteira;
      await salvarMinhaAssinatura(recortada);
      limpar();
      fechar();
      aoSalvar();
    } catch (e) {
      Alert.alert('Erro ao salvar a assinatura', String(e));
    }
  }

  return (
    <Modal visible={aberta} onRequestClose={fechar} animationType="fade" supportedOrientations={['landscape']} statusBarTranslucent>
      <View style={s.tela}>
        <Text style={s.ajuda}><Text style={s.titulo}>Sua assinatura  </Text>Assine grande, usando o quadro todo. Depois é só tocar em "Assinar O.S." em cada atendimento.</Text>
        <View ref={quadro} collapsable={false} style={s.quadro} onLayout={(e) => { largura.current = e.nativeEvent.layout.width; }} {...gesto.panHandlers}>
          <Svg style={StyleSheet.absoluteFill}>
            {[...tracos, atual.current].filter(Boolean).map((d, i) => (
              <Path key={i} d={d} stroke="#111" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
          {tracos.length === 0 && !atual.current ? <Text style={s.dica}>Assine aqui</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={[s.botao, s.secundario]} onPress={fechar}><Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text></Pressable>
          <Pressable style={[s.botao, s.secundario]} onPress={limpar}><Text style={[s.botaoTexto, { color: cores.texto }]}>Limpar</Text></Pressable>
          <Pressable style={[s.botao, { backgroundColor: cores.sucesso }]} onPress={salvar}><Text style={s.botaoTexto}>Salvar</Text></Pressable>
        </View>
      </View>
      <MargemInferior />
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, paddingHorizontal: 40, paddingVertical: 10, gap: 8 },
  titulo: { fontSize: 17, fontWeight: '700', color: cores.texto },
  ajuda: { fontSize: 14, color: cores.suave },
  quadro: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  dica: { color: '#BBB', fontSize: 26 },
  botao: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  secundario: { backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
