import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { cores } from '../lib/estilo';
import { PlanoCaixa, svgMapaFusao } from '../lib/fusao';

const LARGURA_DESENHO = 760;
const ESCALA = 0.9; // texto legível no celular; o desenho rola para o lado
const L = 16;

// Mapa de fusão igual ao do relatório (entrada à esquerda, saídas à direita), com toque em cada fibra de entrada.
// Clientes lançados em outra caixa do caminho aparecem com "↳".
export default function MapaFusaoToque({ caixa, selecionada, naRede, tocar }: {
  caixa: PlanoCaixa; selecionada: number | null;
  naRede: Map<number, { cliente: string | null; apagada: boolean; caixa: string }>; tocar: (fibra: number) => void;
}) {
  const { xml, alvos, altura } = useMemo(() => {
    const locais = new Set((caixa.fibras ?? []).map((f) => f.fibra));
    const herdadas = [...naRede].filter(([n]) => !locais.has(n))
      .map(([n, r]) => ({ fibra: n, cliente: r.apagada ? null : `↳${r.cliente ?? ''}`, sem_potencia: r.apagada, acesa: !r.apagada }));
    const alvos: { fibra: number; y: number }[] = [];
    const xml = svgMapaFusao({ ...caixa, fibras: [...(caixa.fibras ?? []), ...herdadas] }, { todosTubos: true, alvos, selecionada });
    const h = Number(/viewBox="0 -20 \d+ ([\d.]+)"/.exec(xml)?.[1] ?? 400);
    return { xml, alvos, altura: h };
  }, [caixa, naRede, selecionada]);

  const largura = LARGURA_DESENHO * ESCALA;
  return (
    <View style={s.caixa}>
      <Text style={s.titulo}>MAPA DE FUSÃO · toque na fibra da esquerda para marcar acesa, apagada e o cliente</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingRight: 8 }}>
        <View style={{ width: largura, height: altura * ESCALA }}>
          <SvgXml xml={xml} width={largura} height={altura * ESCALA} />
          {alvos.map((a) => (
            <Pressable key={a.fibra} onPress={() => tocar(a.fibra)}
              style={{ position: 'absolute', left: 0, width: 230 * ESCALA, top: (a.y - L / 2 + 20) * ESCALA, height: L * ESCALA }} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { marginTop: 6, marginBottom: 6, paddingVertical: 10, paddingLeft: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda },
  titulo: { fontSize: 12, fontWeight: '800', color: cores.primaria, marginBottom: 8, paddingRight: 10 },
});
