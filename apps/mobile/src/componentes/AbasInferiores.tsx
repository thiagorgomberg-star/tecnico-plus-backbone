import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import Icone, { NomeIcone } from './Icone';

export type Aba = 'atividades' | 'estoque' | 'mais';

const ABAS: { valor: Aba; rotulo: string; icone: NomeIcone; iconeAtivo: NomeIcone }[] = [
  { valor: 'atividades', rotulo: 'Início', icone: 'home-variant-outline', iconeAtivo: 'home-variant' },
  { valor: 'estoque', rotulo: 'Estoque', icone: 'package-variant', iconeAtivo: 'package-variant-closed' },
  { valor: 'mais', rotulo: 'Menu', icone: 'menu', iconeAtivo: 'menu' },
];

export default function AbasInferiores({ atual, mudar, avisos }: { atual: Aba; mudar: (a: Aba) => void; avisos?: Partial<Record<Aba, number>> }) {
  return (
    <View style={s.barra}>
      {ABAS.map((a) => {
        const ativa = a.valor === atual;
        const contador = avisos?.[a.valor] ?? 0;
        return (
          <Pressable key={a.valor} style={s.aba} onPress={() => mudar(a.valor)} accessibilityRole="tab" accessibilityState={{ selected: ativa }}>
            <Icone nome={ativa ? a.iconeAtivo : a.icone} tamanho={26} cor={ativa ? cores.primaria : cores.apagado} />
            <Text style={[s.rotulo, ativa && { color: cores.primaria, fontWeight: '700' }]}>{a.rotulo}</Text>
            <View style={[s.marca, ativa && { backgroundColor: cores.primaria }]} />
            {contador > 0 ? <View style={s.selo}><Text style={s.seloTexto}>{contador}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', backgroundColor: cores.cartao, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  aba: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  rotulo: { fontSize: 13, color: cores.apagado, marginTop: 3, fontWeight: '600' },
  marca: { width: 18, height: 3, borderRadius: 2, marginTop: 4 },
  selo: { position: 'absolute', top: 4, right: '28%', backgroundColor: cores.perigo, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' },
  seloTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
