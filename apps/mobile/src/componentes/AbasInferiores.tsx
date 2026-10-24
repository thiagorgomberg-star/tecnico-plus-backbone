import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import Icone, { NomeIcone } from './Icone';

export type Aba = 'atividades' | 'estoque' | 'mais';

const ABAS: { valor: Aba; rotulo: string; icone: NomeIcone; iconeAtivo: NomeIcone }[] = [
  { valor: 'atividades', rotulo: 'Atividades', icone: 'clipboard-list-outline', iconeAtivo: 'clipboard-list' },
  { valor: 'estoque', rotulo: 'Inventário', icone: 'package-variant', iconeAtivo: 'package-variant-closed' },
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
            <View style={[s.pilula, ativa && { backgroundColor: cores.selecionado }]}>
              <Icone nome={ativa ? a.iconeAtivo : a.icone} tamanho={24} cor={ativa ? cores.primaria : cores.suave} />
            </View>
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
  aba: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
  pilula: { paddingHorizontal: 18, paddingVertical: 3, borderRadius: 14 },
  rotulo: { fontSize: 12, color: cores.suave, marginTop: 2 },
  selo: { position: 'absolute', top: 2, right: '26%', backgroundColor: cores.perigo, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' },
  seloTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
