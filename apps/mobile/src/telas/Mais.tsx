import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { VERSAO_APP } from '../lib/atualizacao';
import { cores } from '../lib/estilo';

type Destino = 'preventiva' | 'escala' | 'rotas';
type Props = { nome: string; cargo: string | null; pendentes: number; abrir: (d: Destino) => void; sair: () => void };

export default function Mais({ nome, cargo, pendentes, abrir, sair }: Props) {
  const item = (rotulo: string, detalhe: string, acao: () => void, cor: string = cores.texto) => (
    <Pressable style={({ pressed }) => [s.item, pressed && { backgroundColor: cores.selecionado }]} onPress={acao}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rotulo, { color: cor }]}>{rotulo}</Text>
        {detalhe ? <Text style={s.detalhe}>{detalhe}</Text> : null}
      </View>
      <Text style={s.seta}>›</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo={nome || 'Técnico Plus'} subtitulo={cargo ?? undefined} />
      <ScrollView>
        <Text style={s.secao}>CAMPO</Text>
        {item('Iniciar preventiva', 'Abrir uma preventiva no local, com o expediente iniciado', () => abrir('preventiva'))}
        {item('Minha escala', 'Jornada, plantão e folgas do mês', () => abrir('escala'))}
        {item('Rotas KMZ', 'Trechos do backbone para abrir no Google Earth', () => abrir('rotas'))}
        <Text style={s.secao}>CONTA</Text>
        {item('Sair', pendentes > 0 ? `${pendentes} registro(s) ainda não enviados` : '', sair, cores.perigo)}
        <Text style={s.versao}>Técnico Plus · versão {VERSAO_APP || 'desenvolvimento'}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  secao: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginHorizontal: 16, marginTop: 18, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.cartao, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: cores.borda },
  rotulo: { fontSize: 16, fontWeight: '600' },
  detalhe: { fontSize: 13, color: cores.suave, marginTop: 2 },
  seta: { fontSize: 24, color: cores.borda },
  versao: { textAlign: 'center', color: cores.suave, fontSize: 12, marginVertical: 24 },
});
