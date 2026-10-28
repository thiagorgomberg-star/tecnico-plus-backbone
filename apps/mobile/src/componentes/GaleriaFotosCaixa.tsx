import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import { excluirFotoCaixa, FotoCaixa, fotosDaCaixa, rotuloFotoCaixa } from '../lib/fotosCaixa';
import BotaoCompartilharFoto from './BotaoCompartilharFoto';
import Icone from './Icone';
import MargemInferior from './MargemInferior';

export type FiltroFotos = { tipo: string; bandeja?: number; fibra?: number; titulo: string };

// Fotos de um item da caixa (acomodação, bandeja, OLT, OTDR): rever, excluir a errada e tirar outra.
export default function GaleriaFotosCaixa({ caixaId, filtro, fechar, tirar }: {
  caixaId: string; filtro: FiltroFotos | null; fechar: () => void; tirar: () => void;
}) {
  const [fotos, setFotos] = useState<FotoCaixa[] | null>(null);
  const [aberta, setAberta] = useState<FotoCaixa | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!filtro) return;
    let vivo = true;
    setFotos(null);
    fotosDaCaixa(caixaId, (f) => vivo && setFotos(f.filter((x) => x.tipo === filtro.tipo
      && (filtro.bandeja == null || x.bandeja === filtro.bandeja) && (filtro.fibra == null || x.fibra === filtro.fibra))))
      .catch(() => vivo && setFotos([]));
    return () => { vivo = false; };
  }, [caixaId, filtro, versao]);

  function excluir(f: FotoCaixa) {
    Alert.alert('Excluir foto?', `${rotuloFotoCaixa(f)}. Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          await excluirFotoCaixa(caixaId, f);
          setAberta(null);
          setFotos((v) => v?.filter((x) => x.uri !== f.uri) ?? null);
          setVersao((n) => n + 1);
        },
      },
    ]);
  }

  return (
    <Modal visible={!!filtro} animationType="slide" onRequestClose={fechar} supportedOrientations={['portrait', 'landscape']}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12}><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <Text style={s.titulo} numberOfLines={1}>{filtro?.titulo}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {fotos == null ? <ActivityIndicator color={cores.primaria} /> : fotos.length === 0 ? (
            <Text style={s.suave}>Nenhuma foto ainda.</Text>
          ) : fotos.map((f) => (
            <View key={f.uri} style={s.cartao}>
              <Pressable onPress={() => setAberta(f)}>
                <Image source={{ uri: f.uri }} style={s.foto} resizeMode="cover" />
              </Pressable>
              <View style={s.linha}>
                <Text style={[s.suave, { flex: 1 }]}>
                  {f.tiradaEm ? new Date(f.tiradaEm).toLocaleString('pt-BR') : ''}{f.pendente ? ' · aguardando envio' : ''}
                </Text>
                <BotaoCompartilharFoto uri={f.uri} titulo={filtro?.titulo} compacto />
                <Pressable style={[s.excluir, { marginLeft: 14 }]} onPress={() => excluir(f)}>
                  <Icone nome="trash-can-outline" tamanho={18} cor={cores.perigo} />
                  <Text style={{ color: cores.perigo, fontWeight: '700' }}>Excluir</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={s.rodape}>
          <Pressable style={s.botao} onPress={tirar}>
            <Icone nome="camera" tamanho={20} cor="#fff" />
            <Text style={s.botaoTexto}>Tirar foto</Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={s.fundo} onPress={() => setAberta(null)}>
          {aberta ? <Image source={{ uri: aberta.uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          {aberta ? <BotaoCompartilharFoto uri={aberta.uri} titulo={filtro?.titulo} /> : null}
          {aberta ? (
            <Pressable style={[s.excluir, { marginTop: 14, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }]} onPress={() => excluir(aberta)}>
              <Icone nome="trash-can-outline" tamanho={18} cor={cores.perigo} />
              <Text style={{ color: cores.perigo, fontWeight: '700' }}>Excluir esta foto</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
      <MargemInferior />
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  titulo: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  suave: { fontSize: 13, color: cores.suave },
  cartao: { backgroundColor: cores.cartao, borderRadius: 12, overflow: 'hidden' },
  foto: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#DCE4EE' },
  linha: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  excluir: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rodape: { padding: 12, paddingBottom: 28, backgroundColor: cores.cartao },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: cores.primaria },
  botaoTexto: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 },
});
