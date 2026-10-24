import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Caixa, caixasDaOs } from '../lib/caixas';
import { cores } from '../lib/estilo';
import { calcularPlano, rotuloPonto } from '../lib/fusao';

// Caixas de emenda / entroncamento / DGO lançadas na O.S.
export default function CaixasOS({ osId, podeEditar, versao, abrir }: {
  osId: string; podeEditar: boolean; versao: number; abrir: (caixa: Caixa | null, daOs: Caixa[]) => void;
}) {
  const [caixas, setCaixas] = useState<Caixa[]>([]);

  useEffect(() => {
    caixasDaOs(osId, setCaixas);
  }, [osId, versao]);

  return (
    <View>
      {caixas.length === 0 ? (
        <View style={s.bloco}><Text style={s.suave}>Nenhuma caixa lançada nesta O.S.</Text></View>
      ) : null}
      {caixas.map((c) => {
        const plano = calcularPlano(c);
        const semPotencia = c.fibras.filter((f) => f.sem_potencia).length;
        return (
          <Pressable key={c.id} style={s.bloco} onPress={() => abrir(c, caixas)}>
            <Text style={s.titulo}>{c.identificacao}</Text>
            <Text style={s.suave}>
              {rotuloPonto(c.tipo)}{c.origem ? ` · vem de ${c.origem}` : ''}
            </Text>
            <Text style={s.suave}>
              {c.capacidade_fibras} FO → {c.saidas.length ? c.saidas.map((q, i) => `S${i + 1} ${q} FO`).join(', ') : 'sem saída'} ·{' '}
              {plano.ligacoes.length} fusões · {c.manobras.length} manobra(s){semPotencia ? ` · ${semPotencia} sem potência` : ''}
            </Text>
            {c.latitude == null ? <Text style={[s.suave, { color: cores.perigo }]}>Sem localização</Text> : null}
          </Pressable>
        );
      })}
      {podeEditar ? (
        <Pressable style={s.botao} onPress={() => abrir(null, caixas)}>
          <Text style={s.botaoTexto}>+ Nova caixa / DGO</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  suave: { fontSize: 13, color: cores.suave, marginTop: 3 },
  botao: { backgroundColor: cores.primaria, borderRadius: 6, paddingVertical: 13, alignItems: 'center', margin: 14 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
