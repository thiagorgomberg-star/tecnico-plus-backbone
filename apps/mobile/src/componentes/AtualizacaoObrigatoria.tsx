import { useEffect, useState } from 'react';
import { AppState, BackHandler, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { LINK_APK, versaoPublicada } from '../lib/atualizacao';

const INSTALADO = 14;
import { cores } from '../lib/estilo';
import Icone from './Icone';

// Ao abrir (e ao voltar para o app), compara o APK instalado com o publicado no GitHub.
// Se houver APK mais novo, a tela fica travada até o técnico instalar. Sem internet não trava.
export default function AtualizacaoObrigatoria() {
  const [nova, setNova] = useState<number | null>(null);

  useEffect(() => {
    // Todo aparelho nesta versão de código (runtime 2) é o APK 14.
    const verificar = () => versaoPublicada().then((v) => { if (v && v > INSTALADO) setNova(v); });
    verificar();
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') verificar(); });
    return () => sub.remove();
  }, []);

  if (!nova) return null;
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
      <View style={s.fundo}>
        <View style={s.icone}><Icone nome="cellphone-arrow-down" tamanho={44} cor={cores.primaria} /></View>
        <Text style={s.titulo}>Atualize o app</Text>
        <Text style={s.texto}>Você está na versão {INSTALADO}. A versão {nova} já está disponível e é obrigatória.</Text>
        <View style={s.passos}>
          <Text style={s.passo}>1. Toque em Baixar versão nova.</Text>
          <Text style={s.passo}>2. Quando o download terminar, abra o arquivo tecnico-plus.apk.</Text>
          <Text style={s.passo}>3. Toque em Atualizar (se pedir, permita instalar apps desta fonte).</Text>
          <Text style={s.passo}>4. Abra o Técnico Plus de novo. Seus dados continuam salvos.</Text>
        </View>
        <Pressable style={s.botao} onPress={() => Linking.openURL(LINK_APK)}>
          <Icone nome="download" tamanho={22} cor="#fff" />
          <Text style={s.botaoTexto}>Baixar versão nova</Text>
        </Pressable>
        <Text style={s.nota}>Registros ainda não enviados não se perdem na atualização.</Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: cores.fundo, padding: 24, paddingBottom: 56, justifyContent: 'center' },
  icone: { alignSelf: 'center', width: 84, height: 84, borderRadius: 42, backgroundColor: cores.cartao, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 24, fontWeight: '800', color: cores.texto, textAlign: 'center', marginTop: 16 },
  texto: { fontSize: 16, color: cores.texto2, textAlign: 'center', marginTop: 8 },
  passos: { backgroundColor: cores.cartao, borderRadius: 16, padding: 16, marginTop: 20, gap: 8 },
  passo: { fontSize: 15, color: cores.texto },
  botao: { flexDirection: 'row', gap: 10, backgroundColor: cores.primaria, borderRadius: 14, height: 58, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  botaoTexto: { color: '#fff', fontSize: 17, fontWeight: '700' },
  nota: { fontSize: 13, color: cores.suave, textAlign: 'center', marginTop: 12 },
});
