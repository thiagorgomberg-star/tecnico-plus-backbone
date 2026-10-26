import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import AnaliseSor from './AnaliseSor';
import Icone from './Icone';
import { supabase } from '../lib/supabase';

type Anexo = { id: string; caminho_arquivo: string; nome_arquivo: string | null; descricao: string | null };
const nomeDe = (a: Anexo) => a.nome_arquivo ?? a.caminho_arquivo.split('/').pop() ?? '';
const ehSor = (a: Anexo) => /\.sor$/i.test(nomeDe(a)) || /\.sor$/i.test(a.caminho_arquivo);

// Arquivos que o supervisor anexou na O.S. para consulta em campo (abre no navegador/visualizador do celular).
export default function MaterialApoio({ osId }: { osId: string }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [curva, setCurva] = useState<Anexo | null>(null);
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
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: cores.borda }}>
          <Pressable onPress={() => abrir(a)} style={{ flex: 1, paddingVertical: 10 }}>
            <Text style={{ color: cores.primaria, fontSize: 15 }}>{nomeDe(a)}</Text>
            {a.descricao ? <Text style={estilo.suave}>{a.descricao}</Text> : null}
          </Pressable>
          {ehSor(a) ? (
            // Curva OTDR: abre direto no analisador do app (fica guardada no celular depois da primeira vez).
            <Pressable onPress={() => setCurva(a)} hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cores.primaria, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Icone nome="chart-bell-curve" tamanho={16} cor="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5 }}>ANALISAR CURVA</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <AnaliseSor curva={curva ? { nome: nomeDe(curva), bucket: 'os-anexos', caminho: curva.caminho_arquivo } : null} extensaoKm={null} fechar={() => setCurva(null)} />
    </View>
  );
}
