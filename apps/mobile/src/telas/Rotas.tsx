import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, Text, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { cores, estilo } from '../lib/estilo';
import { supabase } from '../lib/supabase';

type Rota = { id: string; trecho: string; descricao: string | null; link_kmz: string };
const CACHE = 'rotas-cache';

// Links dos KMZ por trecho (Google Drive). Ao tocar, abre o Drive para baixar e abrir no Google Earth.
export default function Rotas({ voltar }: { voltar: () => void }) {
  const [rotas, setRotas] = useState<Rota[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((c) => c && setRotas(JSON.parse(c)));
    supabase.from('rotas').select('id, trecho, descricao, link_kmz').eq('ativo', true).order('trecho').then(({ data }) => {
      if (!data) return;
      setRotas(data);
      AsyncStorage.setItem(CACHE, JSON.stringify(data));
    });
  }, []);

  async function abrir(r: Rota) {
    try {
      await Linking.openURL(r.link_kmz);
    } catch {
      Alert.alert('Não foi possível abrir o link', r.link_kmz);
    }
  }

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Rotas do backbone" voltar={voltar} />
      <Text style={[estilo.suave, { marginHorizontal: 16, marginTop: 12 }]}>Toque no trecho para baixar o KMZ e abrir no Google Earth.</Text>
      <FlatList
        data={rotas}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={[estilo.suave, { margin: 16 }]}>Nenhum trecho disponível.</Text>}
        renderItem={({ item }) => (
          <Pressable style={estilo.cartao} onPress={() => abrir(item)}>
            <Text style={[estilo.titulo, { fontSize: 16 }]}>{item.trecho}</Text>
            {item.descricao ? <Text style={estilo.suave}>{item.descricao}</Text> : null}
            <Text style={{ color: cores.primaria, marginTop: 6 }}>Abrir KMZ no Drive ›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
