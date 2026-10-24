import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, estilo, fundoDe } from '../lib/estilo';
import { aoMudarFila, enfileirar } from '../lib/fila';
import { inventarioAtualizado, inventarioLocal, ItemInventario, precisaFoto } from '../lib/inventario';
import { supabase } from '../lib/supabase';
import CameraOS from './CameraOS';

const CONDICOES = { ok: 'OK', avariada: 'Avariada', faltando: 'Faltando' } as const;
type Condicao = keyof typeof CONDICOES;
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const diasAte = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

function situacao(i: ItemInventario) {
  if (i.enviando) return { texto: 'Feita · aguardando internet', cor: cores.suave };
  if (i.ciclo === 'pendente') return { texto: 'Primeira foto pendente', cor: cores.perigo };
  if (i.ciclo === 'vencida') return { texto: `Vencida desde ${dataBr(i.proxima_ate)}`, cor: cores.perigo };
  if (i.ciclo === 'vence_em_breve') return { texto: `Vence em ${Math.max(diasAte(i.proxima_ate), 0)} dia(s)`, cor: cores.alerta };
  return { texto: `Em dia até ${dataBr(i.proxima_ate)}`, cor: cores.sucesso };
}

// Inventário Matinal: o técnico fotografa cada ferramenta e EPI liberado, ao menos uma vez a cada 30 dias.
export default function Inventario({ voltar, usuario }: { voltar: () => void; usuario: { nome: string; cargo: string | null } }) {
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<ItemInventario | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const novos = await inventarioAtualizado();
    if (novos) setItens(novos);
    setCarregando(false);
  }, []);

  useEffect(() => {
    inventarioLocal().then(setItens);
    carregar();
    return aoMudarFila(() => inventarioLocal().then(setItens));
  }, [carregar]);

  const faltam = itens.filter(precisaFoto);

  function proximo(depoisDe: string) {
    const seguinte = itens.find((i) => i.id !== depoisDe && precisaFoto(i));
    setAberto(seguinte ?? null);
  }

  if (aberto) {
    return <Inspecao key={aberto.id} item={aberto} usuario={usuario} fechar={() => setAberto(null)} feito={() => proximo(aberto.id)} restantes={faltam.length} />;
  }

  const grupo = (categoria: 'ferramenta' | 'epi', titulo: string) => {
    const lista = itens.filter((i) => i.categoria === categoria);
    if (!lista.length) return null;
    return (
      <>
        <Text style={s.secao}>{titulo} · {lista.length}</Text>
        {lista.map((i) => {
          const st = situacao(i);
          return (
            <Pressable key={i.id} style={({ pressed }) => [s.linha, pressed && { backgroundColor: cores.selecionado }]} onPress={() => setAberto(i)}>
              <View style={[s.barra, { backgroundColor: st.cor }]} />
              <View style={[s.icone, { backgroundColor: fundoDe(st.cor) }]}>
                <Icone nome={categoria === 'epi' ? 'hard-hat' : 'toolbox-outline'} tamanho={20} cor={st.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nome}>{i.nome}</Text>
                <Text style={estilo.suave} numberOfLines={1}>
                  {[i.marca_modelo, i.numero_serie ? `S/N ${i.numero_serie}` : null, i.patrimonio ? `Pat. ${i.patrimonio}` : null].filter(Boolean).join(' · ') || '—'}
                </Text>
                <Text style={{ color: st.cor, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{st.texto}</Text>
              </View>
              <Icone nome={precisaFoto(i) ? 'camera' : 'chevron-right'} tamanho={22} cor={precisaFoto(i) ? cores.primaria : '#B9B4AF'} />
            </Pressable>
          );
        })}
      </>
    );
  };

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Inventário Matinal" subtitulo="Ferramentas e EPI · ciclo de 30 dias" voltar={voltar} />
      <ScrollView refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        <View style={[s.resumo, { borderColor: faltam.length ? cores.perigo : cores.sucesso, backgroundColor: fundoDe(faltam.length ? cores.perigo : cores.sucesso) }]}>
          <Icone nome={faltam.length ? 'camera-account' : 'check-decagram'} tamanho={28} cor={faltam.length ? cores.perigo : cores.sucesso} />
          <View style={{ flex: 1 }}>
            <Text style={s.resumoTitulo}>{faltam.length ? `${faltam.length} item(ns) para fotografar` : 'Inventário em dia'}</Text>
            <Text style={estilo.suave}>{itens.length} item(ns) liberado(s) para você</Text>
          </View>
        </View>
        {faltam.length > 0 && (
          <Pressable style={[estilo.botao, { marginHorizontal: 16, marginTop: 12 }]} onPress={() => setAberto(faltam[0])}>
            <Text style={estilo.botaoTexto}>Começar inspeção ({faltam.length})</Text>
          </Pressable>
        )}
        {itens.length === 0 && !carregando && (
          <Text style={[estilo.suave, { margin: 16 }]}>Nenhuma ferramenta ou EPI cadastrado para você ainda. O supervisor cadastra o que foi liberado.</Text>
        )}
        {grupo('ferramenta', 'FERRAMENTAS')}
        {grupo('epi', 'EPI')}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function Inspecao({ item, usuario, fechar, feito, restantes }: {
  item: ItemInventario; usuario: { nome: string; cargo: string | null }; fechar: () => void; feito: () => void; restantes: number;
}) {
  const [foto, setFoto] = useState<{ arquivo: string; tiradaEm: string; latitude: number | null; longitude: number | null } | null>(null);
  const [camera, setCamera] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>('ok');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!foto) return Alert.alert('Falta a foto', 'Fotografe o item para registrar a inspeção.');
    if (condicao !== 'ok' && !observacao.trim()) return Alert.alert('Descreva o problema', 'Conte o que aconteceu com o item.');
    setSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuarioId = sessao.session?.user.id;
    if (!usuarioId) {
      setSalvando(false);
      return Alert.alert('Sessão expirada', 'Entre de novo no app.');
    }
    await enfileirar({
      tipo: 'inventario',
      arquivo: foto.arquivo,
      linha: {
        id: randomUUID(), ferramenta_id: item.id, tecnico_id: usuarioId, feita_em: foto.tiradaEm, condicao,
        observacao: observacao.trim() || null,
        posicao: foto.latitude != null && foto.longitude != null ? `SRID=4326;POINT(${foto.longitude} ${foto.latitude})` : null,
      },
    });
    setSalvando(false);
    feito();
  }

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo={item.nome} subtitulo={item.categoria === 'epi' ? 'EPI' : 'Ferramenta'} voltar={fechar} />
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={estilo.cartao}>
          <Text style={estilo.suave}>
            {[item.marca_modelo, item.numero_serie ? `S/N ${item.numero_serie}` : null, item.patrimonio ? `Patrimônio ${item.patrimonio}` : null,
              item.validade ? `Validade ${dataBr(item.validade)}` : null].filter(Boolean).join(' · ') || 'Sem detalhes cadastrados'}
          </Text>
          {item.ultima_inspecao ? <Text style={[estilo.suave, { marginTop: 4 }]}>Última foto: {dataBr(item.ultima_inspecao)}</Text> : null}

          <Text style={s.rotulo}>Foto do item *</Text>
          {foto ? <Image source={{ uri: foto.arquivo }} style={s.foto} resizeMode="contain" /> : null}
          <Pressable style={[s.botaoFoto, { backgroundColor: cores.primaria }]} onPress={() => setCamera(true)}>
            <Icone nome="camera" cor="#fff" />
            <Text style={s.botaoFotoTexto}>{foto ? 'Fotografar de novo' : 'Fotografar'}</Text>
          </Pressable>

          <Text style={s.rotulo}>Condição *</Text>
          <View style={s.chips}>
            {(Object.keys(CONDICOES) as Condicao[]).map((k) => {
              const cor = k === 'ok' ? cores.sucesso : k === 'avariada' ? cores.alerta : cores.perigo;
              const ativo = condicao === k;
              return (
                <Pressable key={k} style={[s.chip, ativo && { backgroundColor: cor, borderColor: cor }]} onPress={() => setCondicao(k)}>
                  <Text style={[s.chipTexto, ativo && { color: '#fff' }]}>{CONDICOES[k]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.rotulo}>Observação {condicao !== 'ok' ? '*' : ''}</Text>
          <TextInput style={[estilo.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={observacao} onChangeText={setObservacao} multiline
            placeholder={condicao === 'ok' ? 'Opcional' : 'O que aconteceu com o item'} />

          <Pressable style={[estilo.botao, { backgroundColor: cores.sucesso }]} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : (
              <Text style={estilo.botaoTexto}>{restantes > 1 ? 'Salvar e ir para o próximo' : 'Salvar inspeção'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
      <Modal visible={camera} onRequestClose={() => setCamera(false)} animationType="fade" supportedOrientations={['landscape', 'portrait']}>
        {camera ? (
          <CameraOS osId="" fotosJaFeitas={0} minimo={1} usuario={usuario} fechar={() => setCamera(false)}
            unica={{ titulo: item.nome, aoSalvar: setFoto }} />
        ) : null}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  secao: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginTop: 18, marginBottom: 6, marginHorizontal: 16 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, paddingRight: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: cores.borda },
  barra: { width: 4, alignSelf: 'stretch' },
  icone: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 15, fontWeight: '600', color: cores.texto },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 0, padding: 14, borderWidth: 1, borderRadius: 10 },
  resumoTitulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.suave, marginTop: 14 },
  foto: { width: '100%', height: 200, marginTop: 8, borderRadius: 8, backgroundColor: cores.fundo },
  botaoFoto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, paddingVertical: 12, marginTop: 8 },
  botaoFotoTexto: { color: '#fff', fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipTexto: { color: cores.texto, fontSize: 14 },
});
