import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import Icone, { NomeIcone } from './Icone';

export type AcaoCabecalho = { icone: NomeIcone; rotulo: string; aoTocar: () => void; selo?: number; cor?: string };
type Props = { titulo: string; subtitulo?: string; voltar?: () => void; acoes?: AcaoCabecalho[]; direita?: ReactNode; children?: ReactNode };

// Barra escura no topo de cada tela (padrão Oracle Field Service): voltar, título e atalhos com ícone.
export default function Cabecalho({ titulo, subtitulo, voltar, acoes, direita, children }: Props) {
  return (
    <View style={s.barra}>
      <View style={s.linha}>
        {voltar ? (
          <Pressable onPress={voltar} hitSlop={12} style={s.voltar} accessibilityLabel="Voltar">
            <Icone nome="arrow-left" tamanho={24} cor={cores.cabecalhoTexto} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.titulo} numberOfLines={1}>{titulo}</Text>
          {subtitulo ? <Text style={s.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
        </View>
        {acoes?.map((a) => (
          <Pressable key={a.rotulo} onPress={a.aoTocar} hitSlop={8} style={s.acao} accessibilityLabel={a.rotulo}>
            <Icone nome={a.icone} tamanho={24} cor={a.cor ?? cores.cabecalhoTexto} />
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
  barra: { backgroundColor: cores.cabecalho, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  acao: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: cores.cabecalhoTexto, fontSize: 19, fontWeight: '600', marginLeft: 4 },
  subtitulo: { color: cores.cabecalhoSuave, fontSize: 13, marginTop: 1, marginLeft: 4 },
  selo: { position: 'absolute', top: 3, right: 1, backgroundColor: cores.alerta, borderRadius: 8, minWidth: 16, height: 16,
    paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  seloTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
