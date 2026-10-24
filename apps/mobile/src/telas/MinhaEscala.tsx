import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { carregarEscala, corEscala, hojeLocal, ItemEscala, rotuloEscala } from '../lib/escala';
import { cores, estilo } from '../lib/estilo';
import { supabase } from '../lib/supabase';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function rotuloData(data: string) {
  const [a, m, d] = data.split('-').map(Number);
  const dia = new Date(a, m - 1, d);
  return `${DIAS[dia.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

type Horas = { extra50: number; extra100: number; falta: number; sobreaviso: number; banco: number; regime: string };
const hm = (min: number) => `${min < 0 ? '-' : ''}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, '0')}`;

export default function MinhaEscala({ voltar }: { voltar: () => void }) {
  const [itens, setItens] = useState<ItemEscala[]>([]);
  const [horas, setHoras] = useState<Horas | null>(null);
  const hoje = hojeLocal();

  // Resumo do mês corrente (precisa de internet).
  useEffect(() => {
    supabase.rpc('apuracao_horas', { p_de: `${hoje.slice(0, 7)}-01`, p_ate: hoje }).then(({ data }) => {
      if (!data?.length) return;
      const soma = (k: string) => data.reduce((t: number, d: Record<string, number>) => t + (d[k] ?? 0), 0);
      setHoras({
        extra50: soma('extra50_min'), extra100: soma('extra100_min'), falta: soma('falta_min'),
        sobreaviso: soma('sobreaviso_min'), banco: soma('banco_min'), regime: data[0].regime,
      });
    });
  }, [hoje]);

  useEffect(() => {
    carregarEscala().then((e) => setItens(e.filter((i) => i.data >= hoje)));
  }, [hoje]);

  return (
    <View style={estilo.tela}>
      <Pressable onPress={voltar} style={{ padding: 16 }}>
        <Text style={{ color: cores.primaria, fontSize: 16 }}>‹ Voltar</Text>
      </Pressable>
      <Text style={[estilo.titulo, { marginHorizontal: 16 }]}>Minha escala</Text>
      {horas && (
        <View style={estilo.cartao}>
          <Text style={[estilo.texto, { fontWeight: '700' }]}>Minhas horas neste mês</Text>
          <Text style={estilo.suave}>
            Extra 50%: {hm(horas.extra50)} · Extra 100%: {hm(horas.extra100)}
            {horas.sobreaviso ? ` · Sobreaviso: ${hm(horas.sobreaviso)}` : ''}
            {horas.falta ? ` · Faltas: ${hm(horas.falta)}` : ''}
          </Text>
          {horas.regime === 'banco_horas' ? (
            <Text style={[estilo.texto, { color: horas.banco < 0 ? cores.perigo : cores.sucesso, marginTop: 4 }]}>
              Saldo do banco no mês: {hm(horas.banco)}
            </Text>
          ) : null}
        </View>
      )}
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
