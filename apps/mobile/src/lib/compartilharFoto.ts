import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// Abre o "Compartilhar" do Android com a foto (WhatsApp aparece no topo da lista).
// Foto já enviada vem por link: baixa para o cache antes. Foto da fila já está no celular.
export async function compartilharFoto(uri: string, titulo = 'Foto') {
  try {
    let local = uri;
    if (/^https?:/i.test(uri)) {
      const destino = new File(Paths.cache, `foto-${Date.now()}.jpg`);
      local = (await File.downloadFileAsync(uri, destino)).uri;
    }
    await Sharing.shareAsync(local, { mimeType: 'image/jpeg', dialogTitle: titulo, UTI: 'public.jpeg' });
  } catch {
    Alert.alert('Não deu para compartilhar', 'Sem sinal para baixar a foto. Tente de novo quando tiver internet.');
  }
}
