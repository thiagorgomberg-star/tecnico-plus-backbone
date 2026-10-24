import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { cores } from '../lib/estilo';
import { enfileirar } from '../lib/fila';
import { supabase } from '../lib/supabase';

type Item = { id: string; nome: string; unidade: string; categoria: 'servico' | 'material' };
type Lancamento = { id: string; item_id: string; quantidade: number; observacao: string | null };
type Pessoa = { id: string; nome: string };

const CACHE_CATALOGO = 'catalogo-execucao';
const CACHE_TECNICOS = 'tecnicos-ativos';

// Serviços executados, materiais utilizados e técnicos de apoio da O.S. Tudo funciona sem internet.
export default function ExecucaoOS({ osId, podeEditar, euId }: { osId: string; podeEditar: boolean; euId: string | null }) {
  const [catalogo, setCatalogo] = useState<Item[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [tecnicos, setTecnicos] = useState<Pessoa[]>([]);
  const [apoio, setApoio] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<'servico' | 'material'>('servico');
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [busca, setBusca] = useState('');
  const cacheOs = `execucao-${osId}`;

  useEffect(() => {
    AsyncStorage.multiGet([CACHE_CATALOGO, CACHE_TECNICOS, cacheOs]).then(([cat, tec, os]) => {
      if (cat[1]) setCatalogo(JSON.parse(cat[1]));
      if (tec[1]) setTecnicos(JSON.parse(tec[1]));
      if (os[1]) {
        const salvo = JSON.parse(os[1]);
        setLancamentos(salvo.lancamentos ?? []);
        setApoio(salvo.apoio ?? []);
      }
    });
    supabase.from('itens_execucao').select('id, nome, unidade, categoria').eq('ativo', true).order('ordem').then(({ data }) => {
      if (!data) return;
      setCatalogo(data);
      AsyncStorage.setItem(CACHE_CATALOGO, JSON.stringify(data));
    });
    supabase.rpc('tecnicos_ativos').then(({ data }) => {
      if (!data) return;
      setTecnicos(data);
      AsyncStorage.setItem(CACHE_TECNICOS, JSON.stringify(data));
    });
    Promise.all([
      supabase.from('os_servicos_executados').select('id, item_id, quantidade, observacao').eq('os_id', osId).order('lancado_em'),
      supabase.from('os_tecnicos_apoio').select('tecnico_id').eq('os_id', osId),
    ]).then(([l, a]) => {
      if (l.error || a.error) return;
      setLancamentos(l.data);
      setApoio(a.data.map((x) => x.tecnico_id));
    });
  }, [osId, cacheOs]);

  // Guarda no celular para ver offline.
  useEffect(() => {
    AsyncStorage.setItem(cacheOs, JSON.stringify({ lancamentos, apoio }));
  }, [cacheOs, lancamentos, apoio]);

  const porId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);
  const opcoes = catalogo.filter((c) => c.categoria === categoria && c.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const escolhido = itemId ? porId.get(itemId) : null;

  async function lancar() {
    const valor = Number(quantidade.replace(',', '.'));
    if (!escolhido) return Alert.alert('Escolha o item da lista');
    if (!(valor > 0)) return Alert.alert('Informe a quantidade', `Em ${escolhido.unidade}.`);
    const linha = { id: randomUUID(), os_id: osId, item_id: escolhido.id, quantidade: valor, observacao: null };
    await enfileirar({ tipo: 'inserir', tabela: 'os_servicos_executados', linha });
    setLancamentos((l) => [...l, linha]);
    setItemId(null);
    setQuantidade('');
    setBusca('');
  }

  function remover(l: Lancamento) {
    const item = porId.get(l.item_id);
    Alert.alert('Remover lançamento', `${item?.nome ?? 'Item'}: ${l.quantidade} ${item?.unidade ?? ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          await enfileirar({ tipo: 'excluir', tabela: 'os_servicos_executados', filtros: { id: l.id } });
          setLancamentos((ls) => ls.filter((x) => x.id !== l.id));
        },
      },
    ]);
  }

  async function alternarApoio(p: Pessoa) {
    if (apoio.includes(p.id)) {
      await enfileirar({ tipo: 'excluir', tabela: 'os_tecnicos_apoio', filtros: { os_id: osId, tecnico_id: p.id } });
      setApoio((a) => a.filter((x) => x !== p.id));
    } else {
      await enfileirar({ tipo: 'inserir', tabela: 'os_tecnicos_apoio', linha: { os_id: osId, tecnico_id: p.id }, conflito: 'os_id,tecnico_id' });
      setApoio((a) => [...a, p.id]);
    }
  }

  const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const grupo = (cat: 'servico' | 'material') => lancamentos.filter((l) => porId.get(l.item_id)?.categoria === cat);

  return (
    <View>
      {(['servico', 'material'] as const).map((cat) => (
        <View key={cat} style={s.bloco}>
          <Text style={s.blocoTitulo}>{cat === 'servico' ? 'SERVIÇOS EXECUTADOS' : 'MATERIAIS UTILIZADOS'}</Text>
          {grupo(cat).length === 0 ? <Text style={s.vazio}>Nada lançado.</Text> : null}
          {grupo(cat).map((l) => {
            const item = porId.get(l.item_id);
            return (
              <Pressable key={l.id} style={s.linha} onLongPress={podeEditar ? () => remover(l) : undefined}>
                <Text style={s.linhaNome}>{item?.nome ?? 'Item'}</Text>
                <Text style={s.linhaQtd}>{fmt(l.quantidade)} {item?.unidade}</Text>
                {podeEditar ? (
                  <Pressable hitSlop={10} onPress={() => remover(l)}><Text style={s.remover}>✕</Text></Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {podeEditar ? (
        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>LANÇAR</Text>
          <View style={s.segmento}>
            {(['servico', 'material'] as const).map((c) => (
              <Pressable key={c} style={[s.segmentoItem, categoria === c && s.segmentoAtivo]} onPress={() => { setCategoria(c); setItemId(null); }}>
                <Text style={[s.segmentoTexto, categoria === c && { color: '#fff' }]}>{c === 'servico' ? 'Serviço' : 'Material'}</Text>
              </Pressable>
            ))}
          </View>
          {catalogo.filter((c) => c.categoria === categoria).length > 8 ? (
            <TextInput style={s.campo} placeholder="Buscar..." value={busca} onChangeText={setBusca} />
          ) : null}
          <View style={s.chips}>
            {opcoes.map((c) => (
              <Pressable key={c.id} style={[s.chip, itemId === c.id && s.chipAtivo]} onPress={() => setItemId(c.id)}>
                <Text style={[s.chipTexto, itemId === c.id && { color: '#fff' }]}>{c.nome}</Text>
              </Pressable>
            ))}
            {opcoes.length === 0 ? <Text style={s.vazio}>Nenhum item cadastrado pelo supervisor.</Text> : null}
          </View>
          {escolhido ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput style={[s.campo, { flex: 1, marginTop: 0 }]} keyboardType="decimal-pad" value={quantidade} onChangeText={setQuantidade}
                placeholder={`Quantidade (${escolhido.unidade})`} autoFocus />
              <Pressable style={s.botao} onPress={lancar}><Text style={s.botaoTexto}>Lançar</Text></Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.bloco}>
        <Text style={s.blocoTitulo}>TÉCNICOS DE APOIO</Text>
        {podeEditar ? (
          <View style={s.chips}>
            {tecnicos.filter((t) => t.id !== euId).map((t) => (
              <Pressable key={t.id} style={[s.chip, apoio.includes(t.id) && s.chipAtivo]} onPress={() => alternarApoio(t)}>
                <Text style={[s.chipTexto, apoio.includes(t.id) && { color: '#fff' }]}>{apoio.includes(t.id) ? '✓ ' : ''}{t.nome}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={s.vazio}>
            {apoio.length ? tecnicos.filter((t) => apoio.includes(t.id)).map((t) => t.nome).join(', ') : 'Nenhum.'}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  blocoTitulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginBottom: 6 },
  vazio: { color: cores.suave, fontSize: 14 },
  linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1EFED' },
  linhaNome: { flex: 1, fontSize: 15, color: cores.texto },
  linhaQtd: { fontSize: 15, fontWeight: '700', color: cores.texto, marginRight: 12 },
  remover: { color: cores.perigo, fontSize: 16 },
  segmento: { flexDirection: 'row', borderWidth: 1, borderColor: cores.primaria, borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  segmentoItem: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentoAtivo: { backgroundColor: cores.primaria },
  segmentoTexto: { color: cores.primaria, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.texto, fontSize: 14 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 16, backgroundColor: '#fff', marginTop: 6 },
  botao: { backgroundColor: cores.primaria, borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
