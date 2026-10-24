import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { enfileirar } from '../lib/fila';
import { lerJornada } from '../lib/jornada';
import { posicaoAtual } from '../lib/localizacao';
import { ponto, supabase } from '../lib/supabase';
import { OrdemServico } from '../lib/tipos';

type Rota = { id: string; trecho: string };
const TIPOS = ['Preventiva', 'Preventiva site'];
const CACHE_ROTAS = 'rotas-cache';

// O técnico abre e já inicia uma preventiva em campo (funciona sem internet).
export default function NovaPreventiva({ voltar, abrirOS }: { voltar: () => void; abrirOS: (os: OrdemServico) => void }) {
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [rotaId, setRotaId] = useState<string | null>(null);
  const [local, setLocal] = useState('');
  const [endereco, setEndereco] = useState('');
  const [atividades, setAtividades] = useState('');
  const [ticket, setTicket] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_ROTAS).then((c) => c && setRotas(JSON.parse(c)));
    supabase.from('rotas').select('id, trecho, descricao, link_kmz').eq('ativo', true).order('trecho').then(({ data }) => {
      if (!data) return;
      setRotas(data);
      AsyncStorage.setItem(CACHE_ROTAS, JSON.stringify(data));
    });
  }, []);

  async function iniciar() {
    if (rotas.length > 0 && !rotaId) return Alert.alert('Escolha o trecho', 'Informe em qual trecho do backbone é a preventiva.');
    if (!local.trim()) return Alert.alert('Informe o local', tipo === 'Preventiva site' ? 'Nome do site/POP.' : 'Ponto ou trecho atendido.');
    if (!endereco.trim()) return Alert.alert('Informe o endereço ou referência', 'Ex.: km, cidade, rodovia.');
    if (!atividades.trim()) return Alert.alert('Descreva as atividades', 'O que será verificado ou executado.');

    const jornada = await lerJornada();
    if (!jornada.expedienteId) return Alert.alert('Expediente não iniciado', 'Inicie o expediente antes de abrir uma preventiva.');

    setSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao.session?.user.id;
    if (!usuario) {
      setSalvando(false);
      return Alert.alert('Sessão expirada', 'Entre de novo no app.');
    }
    const coords = await posicaoAtual().catch(() => null);
    const id = randomUUID();
    const agora = new Date().toISOString();
    const linha = {
      id,
      tipo,
      status: 'em_execucao',
      prioridade: 'media',
      titulo: local.trim(),
      endereco: endereco.trim(),
      descricao: atividades.trim(),
      ticket_acionamento: ticket.trim() || null,
      observacao_tecnico: observacao.trim() || null,
      rota_id: rotaId,
      tecnico_id: usuario,
      criada_por: usuario,
      iniciada_em: agora,
      local: coords ? ponto(coords.latitude, coords.longitude) : null,
    };
    await enfileirar({ tipo: 'inserir', tabela: 'ordens_servico', linha });
    setSalvando(false);

    abrirOS({
      id, numero: 0, tipo, prioridade: 'media', status: 'em_execucao',
      titulo: linha.titulo, descricao: linha.descricao, endereco: linha.endereco, prazo: null,
      observacao_tecnico: linha.observacao_tecnico, observacao_supervisor: null, evento_localizado_em: null,
      ticket_acionamento: linha.ticket_acionamento, sla_limite: null,
    });
  }

  const chip = (ativo: boolean) => [s.chip, ativo && { backgroundColor: cores.primaria, borderColor: cores.primaria }];

  return (
    <ScrollView style={estilo.tela} keyboardShouldPersistTaps="handled">
      <Pressable onPress={voltar} style={{ padding: 16 }}>
        <Text style={{ color: cores.primaria, fontSize: 16 }}>‹ Voltar</Text>
      </Pressable>
      <Text style={[estilo.titulo, { marginHorizontal: 16 }]}>Nova preventiva</Text>
      <Text style={[estilo.suave, { marginHorizontal: 16 }]}>
        A preventiva já começa em execução, com a sua localização. Depois é igual a uma O.S.: fotos (mínimo 10) e conclusão.
      </Text>

      <View style={estilo.cartao}>
        <Text style={s.rotulo}>Tipo</Text>
        <View style={s.chips}>
          {TIPOS.map((t) => (
            <Pressable key={t} style={chip(tipo === t)} onPress={() => setTipo(t)}>
              <Text style={[s.chipTexto, tipo === t && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {rotas.length > 0 && (
          <>
            <Text style={s.rotulo}>Trecho</Text>
            <View style={s.chips}>
              {rotas.map((r) => (
                <Pressable key={r.id} style={chip(rotaId === r.id)} onPress={() => setRotaId(r.id)}>
                  <Text style={[s.chipTexto, rotaId === r.id && { color: '#fff' }]}>{r.trecho}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={s.rotulo}>{tipo === 'Preventiva site' ? 'Site / POP *' : 'Local / ponto atendido *'}</Text>
        <TextInput style={estilo.campo} value={local} onChangeText={setLocal}
          placeholder={tipo === 'Preventiva site' ? 'Ex.: POP Taubaté' : 'Ex.: Caixa de emenda km 112'} />

        <Text style={s.rotulo}>Endereço ou referência *</Text>
        <TextInput style={estilo.campo} value={endereco} onChangeText={setEndereco} placeholder="Ex.: Rod. Dutra km 112, Caçapava" />

        <Text style={s.rotulo}>Atividades a executar *</Text>
        <TextInput style={[estilo.campo, { minHeight: 90, textAlignVertical: 'top' }]} value={atividades} onChangeText={setAtividades}
          multiline placeholder="O que será verificado, limpo, medido ou trocado" />

        <Text style={s.rotulo}>Ticket (opcional)</Text>
        <TextInput style={estilo.campo} value={ticket} onChangeText={setTicket} autoCapitalize="characters"
          placeholder="Em branco: o sistema gera um token" />

        <Text style={s.rotulo}>Observações</Text>
        <TextInput style={[estilo.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={observacao} onChangeText={setObservacao} multiline />

        <Pressable style={[estilo.botao, { backgroundColor: cores.sucesso }]} onPress={iniciar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={estilo.botaoTexto}>Iniciar preventiva</Text>}
        </Pressable>
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.suave, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipTexto: { color: cores.texto, fontSize: 14 },
});
