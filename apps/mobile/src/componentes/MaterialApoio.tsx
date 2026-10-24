import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { supabase } from '../lib/supabase';

type Anexo = { id: string; caminho_arquivo: string; nome_arquivo: string | null; descricao: string | null };

// Arquivos que o supervisor anexou na O.S. para consulta em campo (abre no navegador/visualizador do celular).
export default function MaterialApoio({ osId }: { osId: string }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const cache = `apoio-${osId}`;

  useEffect(() => {
    AsyncStorage.getItem(cache).then((c) => c && setAnexos(JSON.parse(c)));
    supabase.from('os_anexos').select('id, caminho_arquivo, nome_arquivo, descricao')
      .eq('os_id', osId).eq('tipo', 'documento').order('criado_em')
      .then(({ data }) => {
        if (!data) return;
        setAnexos(data);
        AsyncStorage.setItem(cache, JSON.stringify(data));
      });
  }, [osId, cache]);

  async function abrir(a: Anexo) {
    const { data, error } = await supabase.storage.from('os-anexos').createSignedUrl(a.caminho_arquivo, 3600);
    if (error || !data) return Alert.alert('Sem conexão', 'Para abrir o material de apoio é preciso internet.');
    Linking.openURL(data.signedUrl);
  }

  if (anexos.length === 0) return null;

  return (
    <View style={estilo.cartao}>
      <Text style={[estilo.titulo, { fontSize: 16 }]}>Material de apoio ({anexos.length})</Text>
      <Text style={estilo.suave}>Enviado pelo supervisor. Toque para abrir.</Text>
      {anexos.map((a) => (
        <Pressable key={a.id} onPress={() => abrir(a)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: cores.borda }}>
          <Text style={{ color: cores.primaria, fontSize: 15 }}>{a.nome_arquivo ?? a.caminho_arquivo.split('/').pop()}</Text>
          {a.descricao ? <Text style={estilo.suave}>{a.descricao}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}
