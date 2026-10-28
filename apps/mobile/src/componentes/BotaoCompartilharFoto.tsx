import { Pressable, StyleSheet, Text } from 'react-native';

import { compartilharFoto } from '../lib/compartilharFoto';
import Icone from './Icone';

// Botão verde "Compartilhar" usado em todas as telas que mostram foto ampliada.
export default function BotaoCompartilharFoto({ uri, titulo, compacto }: { uri: string; titulo?: string; compacto?: boolean }) {
  return (
    <Pressable style={[s.botao, compacto && s.compacto]} onPress={() => compartilharFoto(uri, titulo)} hitSlop={8}
      accessibilityLabel="Compartilhar foto pelo WhatsApp">
      <Icone nome="whatsapp" tamanho={compacto ? 18 : 20} cor="#fff" />
      <Text style={s.texto}>Compartilhar</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: '#25D366', paddingHorizontal: 16, height: 44, borderRadius: 10 },
  compacto: { marginTop: 0, height: 36, paddingHorizontal: 12 },
  texto: { color: '#fff', fontWeight: '700' },
});
