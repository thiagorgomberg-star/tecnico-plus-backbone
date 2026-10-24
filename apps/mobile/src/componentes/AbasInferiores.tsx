import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';

export type Aba = 'atividades' | 'estoque' | 'mais';

const ABAS: { valor: Aba; rotulo: string; icone: string }[] = [
  { valor: 'atividades', rotulo: 'Atividades', icone: '☰' },
  { valor: 'estoque', rotulo: 'Estoque', icone: '▣' },
  { valor: 'mais', rotulo: 'Mais', icone: '⋯' },
];

export default function AbasInferiores({ atual, mudar, avisos }: { atual: Aba; mudar: (a: Aba) => void; avisos?: Partial<Record<Aba, number>> }) {
  return (
    <View style={s.barra}>
      {ABAS.map((a) => {
        const ativa = a.valor === atual;
        const contador = avisos?.[a.valor] ?? 0;
        return (
          <Pressable key={a.valor} style={s.aba} onPress={() => mudar(a.valor)}>
            <Text style={[s.icone, ativa && { color: cores.primaria }]}>{a.icone}</Text>
            <Text style={[s.rotulo, ativa && { color: cores.primaria, fontWeight: '700' }]}>{a.rotulo}</Text>
            {contador > 0 ? <View style={s.selo}><Text style={s.seloTexto}>{contador}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda },
  aba: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  icone: { fontSize: 20, color: cores.suave },
  rotulo: { fontSize: 12, color: cores.suave, marginTop: 2 },
  selo: { position: 'absolute', top: 4, right: '28%', backgroundColor: cores.perigo, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' },
  seloTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
