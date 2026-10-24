import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { carregarEscala, corEscala, hojeLocal, ItemEscala, rotuloEscala } from '../lib/escala';
import Cabecalho from '../componentes/Cabecalho';
import { cores, estilo } from '../lib/estilo';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function rotuloData(data: string) {
  const [a, m, d] = data.split('-').map(Number);
  const dia = new Date(a, m - 1, d);
  return `${DIAS[dia.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export default function MinhaEscala({ voltar }: { voltar: () => void }) {
  const [itens, setItens] = useState<ItemEscala[]>([]);
  const hoje = hojeLocal();

  useEffect(() => {
    carregarEscala().then((e) => setItens(e.filter((i) => i.data >= hoje)));
  }, [hoje]);

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Minha escala" voltar={voltar} />
      <Text style={[estilo.suave, { marginHorizontal: 16, marginTop: 12 }]}>Próximos 60 dias, definidos pelo supervisor.</Text>
      <FlatList
        data={itens}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={[estilo.suave, { margin: 16 }]}>Nada lançado na escala.</Text>}
        renderItem={({ item }) => (
          <View style={[estilo.cartao, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingVertical: 12 }]}>
            <Text style={[estilo.texto, { width: 72, fontWeight: item.data === hoje ? '700' : '400' }]}>
              {item.data === hoje ? 'Hoje' : rotuloData(item.data)}
            </Text>
            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: corEscala[item.tipo] }} />
            <View style={{ flex: 1 }}>
              <Text style={[estilo.texto, { fontWeight: '600', color: corEscala[item.tipo] }]}>{rotuloEscala[item.tipo]}</Text>
              {item.inicio ? (
                <Text style={estilo.suave}>{item.inicio.slice(0, 5)}{item.fim ? ` às ${item.fim.slice(0, 5)}` : ''}</Text>
              ) : null}
              {item.observacao ? <Text style={estilo.suave}>{item.observacao}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
