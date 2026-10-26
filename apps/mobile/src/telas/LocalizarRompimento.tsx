import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import SimularRompimento from '../componentes/SimularRompimento';
import { caixasDaRede } from '../lib/caixas';
import { cores } from '../lib/estilo';
import { CaixaRede, rotuloPonto } from '../lib/fusao';

// Ferramenta à parte (como o analisador de curvas): escolhe onde o OTDR foi ligado e simula o rompimento
// usando o mapeamento e a metragem do cabo já lançados nas caixas (funciona sem internet com o que está no celular).
export default function LocalizarRompimento({ voltar }: { voltar: () => void }) {
  const [caixas, setCaixas] = useState<CaixaRede[] | null>(null);
  const [busca, setBusca] = useState('');
  const [medicao, setMedicao] = useState<CaixaRede | null>(null);

  useEffect(() => {
    let vivo = true;
    caixasDaRede((c) => vivo && setCaixas(c)).then((c) => vivo && setCaixas(c)).catch(() => vivo && setCaixas((v) => v ?? []));
    return () => { vivo = false; };
  }, []);

  // DGO e entroncamento primeiro: a medição costuma ser feita neles.
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const ponta = (c: CaixaRede) => Number(c.tipo === 'dgo' || c.tipo === 'entroncamento');
    return (caixas ?? []).filter((c) => !termo || c.identificacao.toLowerCase().includes(termo))
      .sort((a, b) => ponta(b) - ponta(a) || a.identificacao.localeCompare(b.identificacao));
  }, [caixas, busca]);

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Localizar rompimento" subtitulo="Pela distância do OTDR e a metragem do cabo" voltar={voltar} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Text style={s.ajuda}>Onde o OTDR foi ligado? Escolha o DGO, o entroncamento ou a caixa da medição.</Text>
        <Text style={s.rotulo}>Buscar ponto</Text>
        <TextInput style={s.campo} value={busca} onChangeText={setBusca} placeholder="Ex.: DGO-BKB-0001" placeholderTextColor={cores.apagado} autoCapitalize="characters" />
        {caixas == null ? <ActivityIndicator color={cores.primaria} style={{ marginTop: 20 }} /> : lista.length === 0 ? (
          <Text style={[s.ajuda, { marginTop: 16 }]}>Nenhum ponto mapeado ainda.</Text>
        ) : lista.map((c) => (
          <Pressable key={c.id} style={({ pressed }) => [s.item, pressed && { opacity: 0.85 }]} onPress={() => setMedicao(c)}>
            <Icone nome={c.tipo === 'dgo' ? 'server-network' : 'package-variant'} tamanho={22} cor={cores.primaria} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitulo}>{c.identificacao}</Text>
              <Text style={s.ajuda}>{rotuloPonto(c.tipo ?? 'emenda', c.swap)}</Text>
            </View>
            <Icone nome="chevron-right" tamanho={22} cor={cores.apagado} />
          </Pressable>
        ))}
      </ScrollView>
      {medicao && caixas ? (
        <SimularRompimento aberto fechar={() => setMedicao(null)} medicao={medicao} caixas={caixas} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  ajuda: { fontSize: 13, color: cores.suave },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.texto2, marginTop: 12 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 10, padding: 10, fontSize: 16, color: cores.texto, backgroundColor: '#fff', marginTop: 4, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: 12, padding: 12, marginTop: 8 },
  itemTitulo: { fontSize: 15, fontWeight: '800', color: cores.texto },
});
