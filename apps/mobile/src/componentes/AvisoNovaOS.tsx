import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import Icone from './Icone';
import { cores } from '../lib/estilo';
import { OrdemServico } from '../lib/tipos';

const VISTAS = 'os-avisadas';
// Cada envio é único (reaberta gera novo envio); guarda só os mais recentes.
const chave = (os: OrdemServico) => `${os.id}:${os.enviada_em ?? ''}`;

// Aviso em tela cheia quando chega O.S. nova (ou reaberta) para o técnico, além da notificação do celular.
// Vale também para o que chegou enquanto estava sem sinal: aparece assim que a lista atualizar.
export default function AvisoNovaOS({ ordens, abrir }: { ordens: OrdemServico[]; abrir: (os: OrdemServico) => void }) {
  const [novas, setNovas] = useState<OrdemServico[]>([]);

  useEffect(() => {
    const enviadas = ordens.filter((o) => o.status === 'enviada');
    if (!enviadas.length) return;
    AsyncStorage.getItem(VISTAS).then((v) => {
      const vistas: string[] = v ? JSON.parse(v) : [];
      const faltam = enviadas.filter((o) => !vistas.includes(chave(o)));
      if (!faltam.length) return;
      setNovas(faltam);
      Vibration.vibrate([0, 400, 200, 400]);
    }).catch(() => {});
  }, [ordens]);

  async function marcarVistas() {
    const v = await AsyncStorage.getItem(VISTAS).catch(() => null);
    const vistas: string[] = v ? JSON.parse(v) : [];
    const todas = [...vistas, ...novas.map(chave).filter((k) => !vistas.includes(k))].slice(-200);
    await AsyncStorage.setItem(VISTAS, JSON.stringify(todas)).catch(() => {});
    setNovas([]);
  }

  const os = novas[0];
  if (!os) return null;
  const reaberta = !!os.reaberta_em;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={marcarVistas}>
      <View style={s.fundo}>
        <View style={s.caixa}>
          <View style={[s.icone, { backgroundColor: reaberta ? cores.alerta : cores.primaria }]}>
            <Icone nome={reaberta ? 'restore' : 'bell-ring-outline'} tamanho={30} cor="#fff" />
          </View>
          <Text style={s.titulo}>{reaberta ? 'O.S. reaberta para você' : 'Nova O.S. recebida'}</Text>
          <Text style={s.os}>#{os.numero} · {os.tipo}</Text>
          <Text style={s.nome}>{os.titulo}</Text>
          {os.endereco ? <Text style={s.texto}>{os.endereco}</Text> : null}
          {reaberta && os.reaberta_motivo ? <Text style={[s.texto, { color: cores.alerta }]}>Motivo: {os.reaberta_motivo}</Text> : null}
          {novas.length > 1 ? <Text style={s.mais}>e mais {novas.length - 1} O.S. nova{novas.length > 2 ? 's' : ''}</Text> : null}
          <Pressable style={[s.botao, { backgroundColor: cores.primaria }]} onPress={() => { marcarVistas(); abrir(os); }}>
            <Text style={s.botaoTexto}>Ver O.S.</Text>
          </Pressable>
          <Pressable style={s.depois} onPress={marcarVistas}>
            <Text style={s.depoisTexto}>Depois</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(16,24,40,0.55)', justifyContent: 'center', padding: 24 },
  caixa: { backgroundColor: cores.cartao, borderRadius: 20, padding: 22, alignItems: 'center' },
  icone: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto },
  os: { marginTop: 6, fontSize: 13, color: cores.suave, fontWeight: '600' },
  nome: { marginTop: 4, fontSize: 16, fontWeight: '700', color: cores.texto, textAlign: 'center' },
  texto: { marginTop: 6, fontSize: 14, color: cores.texto2, textAlign: 'center' },
  mais: { marginTop: 10, fontSize: 13, color: cores.suave },
  botao: { marginTop: 18, alignSelf: 'stretch', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  depois: { marginTop: 8, padding: 10 },
  depoisTexto: { color: cores.suave, fontSize: 15, fontWeight: '600' },
});
