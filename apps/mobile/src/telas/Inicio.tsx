import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { cores, estilo } from '../lib/estilo';
import { posicaoAtual } from '../lib/localizacao';
import { ponto, supabase } from '../lib/supabase';
import { Expediente, OrdemServico, rotuloStatus } from '../lib/tipos';

type Props = { nome: string; abrirOS: (os: OrdemServico) => void };

const ABERTAS = ['enviada', 'aceita', 'em_execucao', 'devolvida', 'concluida'];

export default function Inicio({ nome, abrirOS }: Props) {
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [km, setKm] = useState('');
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [exp, os] = await Promise.all([
      supabase.from('expedientes').select('id, inicio, fim, km_inicial').is('fim', null).maybeSingle(),
      supabase
        .from('ordens_servico')
        .select('*')
        .in('status', ABERTAS)
        .order('prioridade', { ascending: false })
        .order('prazo', { ascending: true, nullsFirst: false }),
    ]);
    setExpediente(exp.data);
    setOrdens(os.data ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    // Recarrega quando o supervisor envia ou altera uma O.S.
    const canal = supabase
      .channel('minhas-os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function iniciarExpediente() {
    const kmInicial = parseInt(km, 10);
    if (Number.isNaN(kmInicial)) return Alert.alert('Informe o km do odômetro');
    const pos = await posicaoAtual();
    if (!pos) return Alert.alert('Permita o acesso à localização para iniciar o expediente');
    const { error } = await supabase.from('expedientes').insert({
      km_inicial: kmInicial,
      posicao_inicio: ponto(pos.latitude, pos.longitude),
    });
    if (error) return Alert.alert('Erro ao iniciar expediente', error.message);
    setKm('');
    carregar();
  }

  async function encerrarExpediente() {
    if (!expediente) return;
    const kmFinal = parseInt(km, 10);
    if (Number.isNaN(kmFinal)) return Alert.alert('Informe o km final do odômetro');
    const pos = await posicaoAtual();
    const { error } = await supabase
      .from('expedientes')
      .update({
        fim: new Date().toISOString(),
        km_final: kmFinal,
        posicao_fim: pos ? ponto(pos.latitude, pos.longitude) : null,
      })
      .eq('id', expediente.id);
    if (error) return Alert.alert('Erro ao encerrar expediente', error.message);
    setKm('');
    carregar();
  }

  const cabecalho = (
    <View>
      <View style={estilo.cartao}>
        <Text style={estilo.suave}>Olá, {nome}</Text>
        {expediente ? (
          <>
            <Text style={[estilo.titulo, { color: cores.sucesso }]}>Expediente em andamento</Text>
            <Text style={estilo.suave}>
              Desde {new Date(expediente.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              {expediente.km_inicial != null ? ` · km inicial ${expediente.km_inicial}` : ''}
            </Text>
            <TextInput style={estilo.campo} placeholder="Km final do odômetro" keyboardType="numeric" value={km} onChangeText={setKm} />
            <Pressable style={[estilo.botao, { backgroundColor: cores.perigo }]} onPress={encerrarExpediente}>
              <Text style={estilo.botaoTexto}>Encerrar expediente</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={estilo.titulo}>Expediente não iniciado</Text>
            <TextInput style={estilo.campo} placeholder="Km inicial do odômetro" keyboardType="numeric" value={km} onChangeText={setKm} />
            <Pressable style={estilo.botao} onPress={iniciarExpediente}>
              <Text style={estilo.botaoTexto}>Iniciar expediente</Text>
            </Pressable>
          </>
        )}
      </View>
      <Text style={[estilo.suave, { marginHorizontal: 16, marginTop: 20 }]}>
        ORDENS DE SERVIÇO ({ordens.length})
      </Text>
    </View>
  );

  return (
    <FlatList
      style={estilo.tela}
      data={ordens}
      keyExtractor={(os) => os.id}
      ListHeaderComponent={cabecalho}
      ListEmptyComponent={<Text style={[estilo.suave, { margin: 16 }]}>Nenhuma O.S. aberta.</Text>}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      renderItem={({ item: os }) => {
        const atrasada = os.prazo != null && new Date(os.prazo) < new Date();
        return (
          <Pressable style={estilo.cartao} onPress={() => abrirOS(os)}>
            <Text style={estilo.suave}>
              O.S. #{os.numero} · {rotuloStatus[os.status]} · prioridade {os.prioridade}
            </Text>
            <Text style={estilo.titulo}>{os.titulo}</Text>
            {os.endereco ? <Text style={estilo.texto}>{os.endereco}</Text> : null}
            {os.prazo ? (
              <Text style={[estilo.suave, atrasada && { color: cores.perigo, fontWeight: '600' }]}>
                {atrasada ? 'Atrasada · ' : ''}Prazo {new Date(os.prazo).toLocaleString('pt-BR')}
              </Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}
