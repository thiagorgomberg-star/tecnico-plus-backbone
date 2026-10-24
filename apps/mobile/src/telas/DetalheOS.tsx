import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { supabase } from '../lib/supabase';
import { OrdemServico, proximaAcao, rotuloStatus } from '../lib/tipos';

type Evento = { id: number; status_novo: string; criado_em: string };
type Props = { os: OrdemServico; voltar: () => void };

export default function DetalheOS({ os: inicial, voltar }: Props) {
  const [os, setOs] = useState(inicial);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [observacao, setObservacao] = useState(inicial.observacao_tecnico ?? '');

  useEffect(() => {
    supabase
      .from('os_eventos')
      .select('id, status_novo, criado_em')
      .eq('os_id', os.id)
      .order('criado_em')
      .then(({ data }) => setEventos(data ?? []));
  }, [os.id, os.status]);

  const acao = proximaAcao[os.status];

  async function avancar() {
    if (!acao) return;
    const { data, error } = await supabase
      .from('ordens_servico')
      .update({ status: acao.status, observacao_tecnico: observacao || null })
      .eq('id', os.id)
      .select()
      .single();
    if (error) return Alert.alert('Não foi possível atualizar a O.S.', error.message);
    setOs(data);
  }

  return (
    <ScrollView style={estilo.tela}>
      <Pressable onPress={voltar} style={{ padding: 16 }}>
        <Text style={{ color: cores.primaria, fontSize: 16 }}>‹ Voltar</Text>
      </Pressable>
      <View style={[estilo.cartao, { marginTop: 0 }]}>
        <Text style={estilo.suave}>
          O.S. #{os.numero} · {os.tipo} · {rotuloStatus[os.status]}
        </Text>
        <Text style={estilo.titulo}>{os.titulo}</Text>
        {os.endereco ? <Text style={[estilo.texto, { marginTop: 8 }]}>{os.endereco}</Text> : null}
        {os.descricao ? <Text style={[estilo.texto, { marginTop: 8 }]}>{os.descricao}</Text> : null}
        {os.prazo ? <Text style={[estilo.suave, { marginTop: 8 }]}>Prazo {new Date(os.prazo).toLocaleString('pt-BR')}</Text> : null}
        {os.status === 'devolvida' && os.observacao_supervisor ? (
          <Text style={[estilo.texto, { marginTop: 8, color: cores.perigo }]}>
            Devolvida pelo supervisor: {os.observacao_supervisor}
          </Text>
        ) : null}
      </View>

      {acao ? (
        <View style={estilo.cartao}>
          <TextInput
            style={[estilo.campo, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Observações do atendimento"
            multiline
            value={observacao}
            onChangeText={setObservacao}
          />
          <Pressable style={estilo.botao} onPress={avancar}>
            <Text style={estilo.botaoTexto}>{acao.rotulo}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={estilo.cartao}>
          <Text style={estilo.texto}>
            {os.status === 'concluida' ? 'Aguardando a baixa do supervisor.' : 'Nenhuma ação pendente.'}
          </Text>
        </View>
      )}

      <View style={[estilo.cartao, { marginBottom: 32 }]}>
        <Text style={[estilo.titulo, { fontSize: 16 }]}>Histórico</Text>
        {eventos.map((e) => (
          <Text key={e.id} style={[estilo.suave, { marginTop: 6 }]}>
            {new Date(e.criado_em).toLocaleString('pt-BR')} · {rotuloStatus[e.status_novo as keyof typeof rotuloStatus]}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
