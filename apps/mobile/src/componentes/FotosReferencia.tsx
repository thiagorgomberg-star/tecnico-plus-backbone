import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { fotosReferencia } from '../lib/referencia';
import Icone from './Icone';

// Fotos tiradas na vistoria que gerou esta O.S.: mostram o problema e o ângulo que a foto da correção deve repetir.
export default function FotosReferencia({ osId }: { osId: string }) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    fotosReferencia(osId, setFotos).catch(() => {});
  }, [osId]);

  if (!fotos.length) return null;
  return (
    <View style={estilo.cartao}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icone nome="image-multiple-outline" tamanho={20} cor={cores.primaria} />
        <Text style={[estilo.titulo, { fontSize: 16, flex: 1 }]}>Fotos de referência ({fotos.length})</Text>
      </View>
      <Text style={estilo.suave}>
        Tiradas na vistoria. Na baixa, fotografe a correção no mesmo ângulo e posição de cada uma: a câmera mostra a foto como guia.
      </Text>
      <ScrollView horizontal style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
        {fotos.map((uri) => (
          <Pressable key={uri} onPress={() => setAberta(uri)}>
            <Image source={{ uri }} style={s.miniatura} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)}
        supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={s.fundo} onPress={() => setAberta(null)}>
          {aberta ? <Image source={{ uri: aberta }} style={s.grande} resizeMode="contain" /> : null}
          <Text style={s.fechar}>Toque para fechar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  miniatura: { width: 128, height: 96, borderRadius: 10, backgroundColor: '#E2E7EE' },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  grande: { width: '100%', height: '85%' },
  fechar: { color: '#fff', marginTop: 12, fontSize: 14 },
});
