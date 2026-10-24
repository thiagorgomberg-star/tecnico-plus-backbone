import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { cores } from '../lib/estilo';
import { supabase } from '../lib/supabase';

type Saldo = { item_id: string; nome: string; unidade: string; saldo: number };
const CACHE = 'meu-estoque';

// Material liberado pelo almoxarifado que está com o técnico (baixa automática ao lançar consumo na O.S.).
export default function Estoque({ euId }: { euId: string | null }) {
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!euId) return;
    setCarregando(true);
    const { data } = await supabase.from('saldo_tecnicos').select('item_id, nome, unidade, saldo').eq('tecnico_id', euId).order('nome');
    if (data) {
      setSaldos(data);
      AsyncStorage.setItem(CACHE, JSON.stringify(data));
    }
    setCarregando(false);
  }, [euId]);

  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((c) => c && setSaldos(JSON.parse(c)));
    carregar();
  }, [carregar]);

  const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Meu estoque" subtitulo="Material liberado pelo almoxarifado backbone" />
      <FlatList
        data={saldos}
        keyExtractor={(s) => s.item_id}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
        ListEmptyComponent={<Text style={s.vazio}>Nenhum material com você. O supervisor libera pelo painel.</Text>}
        ListHeaderComponent={saldos.length ? <Text style={s.dica}>O consumo lançado nas O.S. é descontado automaticamente.</Text> : undefined}
        renderItem={({ item }) => (
          <View style={s.linha}>
            <Text style={s.nome}>{item.nome}</Text>
            <Text style={[s.saldo, item.saldo <= 0 && { color: cores.perigo }]}>{fmt(item.saldo)} {item.unidade}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.cartao, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: cores.borda },
  nome: { flex: 1, fontSize: 15, color: cores.texto },
  saldo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  vazio: { color: cores.suave, margin: 16, textAlign: 'center' },
  dica: { color: cores.suave, fontSize: 13, margin: 12 },
});
