import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { cores } from '../lib/estilo';
import { aoMudarFila, caminhoFotoOs, enfileirar, itensPendentes, legendarFoto, removerDaFila } from '../lib/fila';
import { supabase } from '../lib/supabase';
import Icone from './Icone';

type Foto = { uri: string; tipo: string; caminho: string; filaId?: string; tiradaEm: string | null; legenda: string | null };

// Fotos antes/depois da O.S.: miniaturas para rever, ampliar e excluir a tirada errado.
// As que ainda estão na fila aparecem do arquivo do celular; as enviadas vêm por link (precisa de sinal).
export default function FotosDaOS({ osId, podeExcluir }: { osId: string; podeExcluir: boolean }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [aberta, setAberta] = useState<Foto | null>(null);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const fila = await itensPendentes();
      // Legendas escritas que ainda não subiram (a última vale).
      const legendas = new Map(fila.flatMap((i) => (i.tipo === 'rpc' && i.nome === 'legendar_foto_os' ? [[String(i.args.p_caminho), String(i.args.p_legenda ?? '')] as const] : [])));
      const locais: Foto[] = fila.flatMap((i) => (i.tipo === 'foto' && i.osId === osId && (i.tipoAnexo === 'foto_antes' || i.tipoAnexo === 'foto_depois')
        ? [{ uri: i.arquivo, tipo: i.tipoAnexo, filaId: i.id, caminho: caminhoFotoOs(osId, i.id), tiradaEm: i.tiradaEm,
          legenda: legendas.get(caminhoFotoOs(osId, i.id)) || i.descricao || null }] : []));
      const excluindo = new Set(fila.flatMap((i) => (i.tipo === 'rpc' && i.nome === 'excluir_foto_os' ? [String(i.args.p_caminho)] : [])));
      if (vivo) setFotos((v) => [...v.filter((x) => !x.filaId), ...locais]); // as do celular aparecem na hora, mesmo sem sinal
      let enviadas: Foto[] = [];
      try {
        const { data } = await supabase.from('os_anexos').select('caminho_arquivo, tipo, tirada_em, criado_em, descricao')
          .eq('os_id', osId).in('tipo', ['foto_antes', 'foto_depois']).order('criado_em');
        const lista = (data ?? []).filter((a) => !excluindo.has(a.caminho_arquivo));
        if (lista.length) {
          const { data: urls } = await supabase.storage.from('os-anexos').createSignedUrls(lista.map((a) => a.caminho_arquivo), 3600);
          enviadas = lista.flatMap((a, j) => (urls?.[j]?.signedUrl
            ? [{ uri: urls[j].signedUrl, tipo: a.tipo, caminho: a.caminho_arquivo, tiradaEm: a.tirada_em ?? a.criado_em,
              legenda: legendas.has(a.caminho_arquivo) ? legendas.get(a.caminho_arquivo) || null : a.descricao }] : []));
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
          else await enfileirar({ tipo: 'rpc', nome: 'excluir_foto_os', args: { p_caminho: f.caminho } });
          setAberta(null);
          setFotos((v) => v.filter((x) => x.uri !== f.uri));
        },
      },
    ]);
  }

  // Balão "+ Legenda": escreve ou corrige a legenda que vai embaixo da foto no relatório.
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  async function gravarLegenda() {
    if (!aberta) return;
    setEscrevendo(false);
    await legendarFoto(aberta.caminho, texto);
    const nova = texto.trim() || null;
    setFotos((v) => v.map((x) => (x.uri === aberta.uri ? { ...x, legenda: nova } : x)));
    setAberta({ ...aberta, legenda: nova });
  }

  // Navegar entre as fotos com as setas ou arrastando para os lados.
  const pos = aberta ? Math.max(0, fotos.findIndex((f) => f.uri === aberta.uri)) : 0;
  const andar = (passo: number) => setAberta(fotos[(pos + passo + fotos.length) % fotos.length]);
  const toqueX = useRef(0);

  if (!fotos.length) return null;
  return (
    <View style={s.grade}>
      {fotos.map((f) => (
        <Pressable key={f.uri} onPress={() => setAberta(f)}>
          <Image source={{ uri: f.uri }} style={s.miniatura} />
          <Text style={s.legenda}>{f.tipo === 'foto_antes' ? 'Antes' : 'Depois'}{f.filaId ? ' · na fila' : ''}</Text>
          {f.legenda ? <Text style={s.legendaMini} numberOfLines={1}>💬 {f.legenda}</Text> : null}
        </Pressable>
      ))}
      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={[s.fundo, escrevendo && { justifyContent: 'flex-start', paddingTop: 40 }]} onPress={() => setAberta(null)}>
          {aberta ? (
            <View style={{ width: '100%', height: escrevendo ? '35%' : '72%' }}
              onStartShouldSetResponder={() => true /* arrastar a foto não fecha a tela */}
              onTouchStart={(e) => { toqueX.current = e.nativeEvent.pageX; }}
              onTouchEnd={(e) => { const dx = e.nativeEvent.pageX - toqueX.current; if (Math.abs(dx) > 50 && fotos.length > 1) andar(dx < 0 ? 1 : -1); }}>
              <Image source={{ uri: aberta.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              {fotos.length > 1 ? (
                <>
                  <Pressable style={[s.seta, { left: 4 }]} onPress={() => andar(-1)} hitSlop={10} accessibilityLabel="Foto anterior">
                    <Icone nome="chevron-left" tamanho={34} cor="#fff" />
                  </Pressable>
                  <Pressable style={[s.seta, { right: 4 }]} onPress={() => andar(1)} hitSlop={10} accessibilityLabel="Próxima foto">
                    <Icone nome="chevron-right" tamanho={34} cor="#fff" />
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          {aberta ? <Text style={s.legendaGrande}>{fotos.length > 1 ? `${pos + 1} de ${fotos.length} · ` : ''}{aberta.tipo === 'foto_antes' ? 'Antes' : 'Depois'}{aberta.tiradaEm ? ` · ${new Date(aberta.tiradaEm).toLocaleString('pt-BR')}` : ''}</Text> : null}
          {aberta && escrevendo ? (
            <View style={s.balaoCaixa} onStartShouldSetResponder={() => true}>
              <Text style={s.balaoRotulo}>Legenda da foto (aparece no relatório)</Text>
              <TextInput autoFocus value={texto} onChangeText={setTexto} maxLength={300} multiline style={s.balaoCampo}
                placeholder="Ex.: cabo rompido por queda de árvore" placeholderTextColor={cores.apagado} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable style={[s.balaoBotao, { backgroundColor: '#eee' }]} onPress={() => setEscrevendo(false)}><Text style={{ fontWeight: '700' }}>Cancelar</Text></Pressable>
                <Pressable style={[s.balaoBotao, { backgroundColor: cores.primaria }]} onPress={gravarLegenda}><Text style={{ fontWeight: '700', color: '#fff' }}>Salvar legenda</Text></Pressable>
              </View>
            </View>
          ) : aberta ? (
            aberta.legenda ? (
              <Pressable style={s.balao} disabled={!podeExcluir} onPress={() => { setTexto(aberta.legenda ?? ''); setEscrevendo(true); }}>
                <Text style={s.balaoTexto}>💬 {aberta.legenda}</Text>
                {podeExcluir ? <Text style={s.balaoEditar}>Toque para editar</Text> : null}
              </Pressable>
            ) : podeExcluir ? (
              <Pressable style={s.balaoMais} onPress={() => { setTexto(''); setEscrevendo(true); }} accessibilityLabel="Escrever legenda">
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -2 }}>+</Text>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Legenda</Text>
              </Pressable>
            ) : null
          ) : null}
          {aberta && podeExcluir && !escrevendo ? (
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
  seta: { position: 'absolute', top: '50%', marginTop: -26, width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  legendaGrande: { color: '#fff', marginTop: 10, fontSize: 13 },
  legendaMini: { fontSize: 11.5, color: cores.texto2, maxWidth: 104 },
  balao: { marginTop: 10, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '92%' },
  balaoTexto: { fontSize: 15, color: cores.texto },
  balaoEditar: { fontSize: 11.5, color: cores.apagado, marginTop: 2 },
  balaoMais: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: cores.primaria, paddingHorizontal: 16, height: 44, borderRadius: 22 },
  balaoCaixa: { marginTop: 10, width: '92%', backgroundColor: '#fff', borderRadius: 14, padding: 12 },
  balaoRotulo: { fontSize: 13, fontWeight: '700', color: cores.texto2, marginBottom: 6 },
  balaoCampo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 8, padding: 10, fontSize: 16, minHeight: 48, color: cores.texto },
  balaoBotao: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  excluir: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
