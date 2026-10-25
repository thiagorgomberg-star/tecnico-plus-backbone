import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { cores } from '../lib/estilo';
import Icone, { NomeIcone } from './Icone';

export type AcaoCabecalho = { icone: NomeIcone; rotulo: string; aoTocar: () => void; selo?: number; cor?: string };
type Props = {
  titulo: string; subtitulo?: string; voltar?: () => void; acoes?: AcaoCabecalho[]; direita?: ReactNode; children?: ReactNode;
  // Espaço extra embaixo para um cartão "flutuar" por cima do topo (tela inicial).
  estendido?: number;
};

// Degradê do topo na cor do tema (do tom escuro para o tom do tema).
export function FundoDegrade() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="topo" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={cores.cabecalho2} />
          <Stop offset="1" stopColor={cores.cabecalho} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" fill="url(#topo)" />
    </Svg>
  );
}

// Topo de cada tela: voltar, título e atalhos em botões redondos translúcidos.
export default function Cabecalho({ titulo, subtitulo, voltar, acoes, direita, children, estendido = 0 }: Props) {
  return (
    <View style={[s.barra, { paddingBottom: 12 + estendido }]}>
      <FundoDegrade />
      <View style={s.linha}>
        {voltar ? (
          <Pressable onPress={voltar} hitSlop={12} style={[s.botao, { marginRight: 10 }]} accessibilityLabel="Voltar">
            <Icone nome="arrow-left" tamanho={22} cor={cores.cabecalhoTexto} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {subtitulo && !voltar ? <Text style={s.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
          <Text style={[s.titulo, !voltar && s.tituloGrande]} numberOfLines={1}>{titulo}</Text>
          {subtitulo && voltar ? <Text style={s.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
        </View>
        {acoes?.map((a) => (
          <Pressable key={a.rotulo} onPress={a.aoTocar} hitSlop={6} style={[s.botao, { marginLeft: 10 }]} accessibilityLabel={a.rotulo}>
            <Icone nome={a.icone} tamanho={21} cor={a.cor ?? cores.cabecalhoTexto} />
            {a.selo ? <View style={s.selo}><Text style={s.seloTexto}>{a.selo > 99 ? '99+' : a.selo}</Text></View> : null}
          </Pressable>
        ))}
        {direita}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 10, overflow: 'hidden' },
  linha: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  botao: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  titulo: { color: cores.cabecalhoTexto, fontSize: 18, fontWeight: '700' },
  tituloGrande: { fontSize: 22, letterSpacing: -0.3, marginTop: 1 },
  subtitulo: { color: cores.cabecalhoSuave, fontSize: 13, marginTop: 1 },
  selo: { position: 'absolute', top: -3, right: -3, backgroundColor: '#FF6B57', borderRadius: 9, minWidth: 18, height: 18,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: cores.cabecalho2 },
  seloTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
