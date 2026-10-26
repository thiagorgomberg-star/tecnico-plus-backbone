import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import { aoMudarFila, enfileirar, itensPendentes, removerDaFila } from '../lib/fila';
import { supabase } from '../lib/supabase';
import Icone from './Icone';

type Foto = { uri: string; tipo: string; caminho?: string; filaId?: string; tiradaEm: string | null };

// Fotos antes/depois da O.S.: miniaturas para rever, ampliar e excluir a tirada errado.
// As que ainda estão na fila aparecem do arquivo do celular; as enviadas vêm por link (precisa de sinal).
export default function FotosDaOS({ osId, podeExcluir }: { osId: string; podeExcluir: boolean }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [aberta, setAberta] = useState<Foto | null>(null);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const fila = await itensPendentes();
      const locais: Foto[] = fila.flatMap((i) => (i.tipo === 'foto' && i.osId === osId && (i.tipoAnexo === 'foto_antes' || i.tipoAnexo === 'foto_depois')
        ? [{ uri: i.arquivo, tipo: i.tipoAnexo, filaId: i.id, tiradaEm: i.tiradaEm }] : []));
      const excluindo = new Set(fila.flatMap((i) => (i.tipo === 'rpc' && i.nome === 'excluir_foto_os' ? [String(i.args.p_caminho)] : [])));
      let enviadas: Foto[] = [];
      try {
        const { data } = await supabase.from('os_anexos').select('caminho_arquivo, tipo, tirada_em, criado_em')
          .eq('os_id', osId).in('tipo', ['foto_antes', 'foto_depois']).order('criado_em');
        const lista = (data ?? []).filter((a) => !excluindo.has(a.caminho_arquivo));
        if (lista.length) {
          const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(lista.map((a) => a.caminho_arquivo), 3600);
          enviadas = lista.flatMap((a, j) => (urls?.[j]?.signedUrl
            ? [{ uri: urls[j].signedUrl, tipo: a.tipo, caminho: a.caminho_arquivo, tiradaEm: a.tirada_em ?? a.criado_em }] : []));
        }
      } catch { /* sem sinal: só as da fila */ }
      if (vivo) setFotos([...enviadas, ...locais]);
    };
    carregar();
    const parar = aoMudarFila(carregar);
    return () => { vivo = false; parar(); };
  }, [osId]);

  function excluir(f: Foto) {
    Alert.alert('Excluir foto?', `Foto ${f.tipo === 'foto_antes' ? 'antes' : 'depois'}. Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          if (f.filaId) await removerDaFila(f.filaId);
          else if (f.caminho) await enfileirar({ tipo: 'rpc', nome: 'excluir_foto_os', args: { p_caminho: f.caminho } });
          setAberta(null);
          setFotos((v) => v.filter((x) => x.uri !== f.uri));
        },
      },
    ]);
  }

  if (!fotos.length) return null;
  return (
    <View style={s.grade}>
      {fotos.map((f) => (
        <Pressable key={f.uri} onPress={() => setAberta(f)}>
          <Image source={{ uri: f.uri }} style={s.miniatura} />
          <Text style={s.legenda}>{f.tipo === 'foto_antes' ? 'Antes' : 'Depois'}{f.filaId ? ' · na fila' : ''}</Text>
        </Pressable>
      ))}
      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={s.fundo} onPress={() => setAberta(null)}>
          {aberta ? <Image source={{ uri: aberta.uri }} style={{ width: '100%', height: '78%' }} resizeMode="contain" /> : null}
          {aberta ? <Text style={s.legendaGrande}>{aberta.tipo === 'foto_antes' ? 'Antes' : 'Depois'}{aberta.tiradaEm ? ` · ${new Date(aberta.tiradaEm).toLocaleString('pt-BR')}` : ''}</Text> : null}
          {aberta && podeExcluir ? (
            <Pressable style={s.excluir} onPress={() => excluir(aberta)}>
              <Icone nome="trash-can-outline" tamanho={18} cor={cores.perigo} />
              <Text style={{ color: cores.perigo, fontWeight: '700' }}>Excluir esta foto</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  miniatura: { width: 104, height: 78, borderRadius: 8, backgroundColor: '#DCE4EE' },
  legenda: { fontSize: 11.5, color: cores.suave, marginTop: 2 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  legendaGrande: { color: '#fff', marginTop: 10, fontSize: 13 },
  excluir: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
