import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';

type Props = { titulo: string; subtitulo?: string; voltar?: () => void; direita?: ReactNode; children?: ReactNode };

// Barra escura no topo de cada tela (padrão Oracle Field Service).
export default function Cabecalho({ titulo, subtitulo, voltar, direita, children }: Props) {
  return (
    <View style={s.barra}>
      <View style={s.linha}>
        {voltar ? (
          <Pressable onPress={voltar} hitSlop={12} style={s.voltar}>
            <Text style={s.voltarTexto}>‹</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.titulo} numberOfLines={1}>{titulo}</Text>
          {subtitulo ? <Text style={s.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
        </View>
        {direita}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  voltar: { marginRight: 10, paddingRight: 4 },
  voltarTexto: { color: cores.cabecalhoTexto, fontSize: 32, lineHeight: 34, fontWeight: '300' },
  titulo: { color: cores.cabecalhoTexto, fontSize: 19, fontWeight: '600' },
  subtitulo: { color: cores.cabecalhoSuave, fontSize: 13, marginTop: 2 },
});
