import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import MaterialApoio from '../componentes/MaterialApoio';
import { cores, estilo } from '../lib/estilo';
import { aoMudarFila, enfileirar, itensPendentes } from '../lib/fila';
import { textoSla } from '../lib/formato';
import { posicaoAtual } from '../lib/localizacao';
import { ponto, supabase } from '../lib/supabase';
import { OrdemServico, proximaAcao, rotuloStatus, StatusOS } from '../lib/tipos';

type Evento = { id: number; status_novo: StatusOS; criado_em: string };
type Props = { os: OrdemServico; voltar: () => void; abrirCamera: (fotosJaFeitas: number) => void };

const MINIMO_FOTOS = 10;
// Campo que guarda a hora real de cada etapa (enviada mesmo se a ação foi offline).
const campoHora: Partial<Record<StatusOS, string>> = {
  aceita: 'aceita_em',
  em_execucao: 'iniciada_em',
  concluida: 'concluida_em',
};
const ehCorretiva = (tipo: string) => /corretiva/i.test(tipo);

export default function DetalheOS({ os: inicial, voltar, abrirCamera }: Props) {
  const [os, setOs] = useState(inicial);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [observacao, setObservacao] = useState(inicial.observacao_tecnico ?? '');
  const [fotosEnviadas, setFotosEnviadas] = useState(0);
  const [fotosNaFila, setFotosNaFila] = useState(0);

  const contarFotos = useCallback(async () => {
    const pendentes = await itensPendentes();
    setFotosNaFila(pendentes.filter((i) => i.tipo === 'foto' && i.osId === os.id).length);
    const { count } = await supabase
      .from('os_anexos')
      .select('id', { count: 'exact', head: true })
      .eq('os_id', os.id)
      .in('tipo', ['foto_antes', 'foto_depois']);
    if (count != null) setFotosEnviadas(count);
  }, [os.id]);

  useEffect(() => {
    contarFotos();
    return aoMudarFila(contarFotos);
  }, [contarFotos]);

  useEffect(() => {
    supabase
      .from('os_eventos')
      .select('id, status_novo, criado_em')
      .eq('os_id', os.id)
      .order('criado_em')
      .then(({ data }) => data && setEventos(data));
  }, [os.id, os.status]);

  const totalFotos = fotosEnviadas + fotosNaFila;
  const acao = proximaAcao[os.status];

  async function avancar() {
    if (!acao) return;
    if (acao.status === 'concluida' && totalFotos < MINIMO_FOTOS) {
      return Alert.alert('Faltam fotos', `Tire pelo menos ${MINIMO_FOTOS} fotos na horizontal antes de concluir (${totalFotos} até agora).`);
    }
    const agora = new Date().toISOString();
    const campos: Record<string, unknown> = { status: acao.status, observacao_tecnico: observacao || null };
    const hora = campoHora[acao.status];
    if (hora) campos[hora] = agora;
    await enfileirar({ tipo: 'os', osId: os.id, campos });
    setOs({ ...os, status: acao.status, observacao_tecnico: observacao || null });
    setEventos((e) => [...e, { id: -e.length - 1, status_novo: acao.status, criado_em: agora }]);
  }

  // Funciona sem internet: o GPS do celular não depende de dados móveis.
  async function localizarEvento() {
    const pos = await posicaoAtual();
    if (!pos) return Alert.alert('Permita o acesso à localização para registrar o evento');
    const agora = new Date().toISOString();
    await enfileirar({
      tipo: 'os',
      osId: os.id,
      campos: {
        evento_localizado_em: agora,
        evento_posicao: ponto(pos.latitude, pos.longitude),
        evento_precisao_m: pos.accuracy,
      },
    });
    setOs({ ...os, evento_localizado_em: agora });
    Alert.alert('Evento localizado', `Posição registrada com precisão de ${Math.round(pos.accuracy ?? 0)} m.`);
  }

  const podeFotografar = os.status === 'em_execucao' || os.status === 'aceita' || os.status === 'devolvida';

  return (
    <ScrollView style={estilo.tela}>
      <Pressable onPress={voltar} style={{ padding: 16 }}>
        <Text style={{ color: cores.primaria, fontSize: 16 }}>‹ Voltar</Text>
      </Pressable>
      <View style={[estilo.cartao, { marginTop: 0 }]}>
        <Text style={estilo.suave}>
          {os.numero ? `O.S. #${os.numero}` : 'O.S. nova'} · {os.tipo} · {rotuloStatus[os.status]}
          {os.ticket_acionamento ? ` · Ticket ${os.ticket_acionamento}` : ''}
        </Text>
        <Text style={estilo.titulo}>{os.titulo}</Text>
        {os.endereco ? <Text style={[estilo.texto, { marginTop: 8 }]}>{os.endereco}</Text> : null}
        {os.descricao ? <Text style={[estilo.texto, { marginTop: 8 }]}>{os.descricao}</Text> : null}
        {os.sla_limite && !['concluida', 'baixada', 'cancelada'].includes(os.status) ? (
          <Text style={[estilo.texto, { marginTop: 8, fontWeight: '600', color: textoSla(os.sla_limite).nivel === 'vencido' ? cores.perigo : cores.texto }]}>
            {textoSla(os.sla_limite).texto} (limite {new Date(os.sla_limite).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
          </Text>
        ) : null}
        {os.prazo ? <Text style={[estilo.suave, { marginTop: 8 }]}>Prazo {new Date(os.prazo).toLocaleString('pt-BR')}</Text> : null}
        {os.status === 'devolvida' && os.observacao_supervisor ? (
          <Text style={[estilo.texto, { marginTop: 8, color: cores.perigo }]}>
            Devolvida pelo supervisor: {os.observacao_supervisor}
          </Text>
        ) : null}
        {os.status === 'pausada' ? (
          <Text style={[estilo.texto, { marginTop: 8, color: cores.suave }]}>Pausada pela refeição. Retoma ao encerrar a refeição.</Text>
        ) : null}
      </View>

      <MaterialApoio osId={os.id} />

      {ehCorretiva(os.tipo) && os.status !== 'baixada' && os.status !== 'cancelada' ? (
        <View style={estilo.cartao}>
          <Text style={[estilo.titulo, { fontSize: 16 }]}>Local do evento</Text>
          <Text style={estilo.suave}>
            {os.evento_localizado_em
              ? `Registrado às ${new Date(os.evento_localizado_em).toLocaleTimeString('pt-BR')}`
              : 'Ainda não registrado. Funciona mesmo sem internet.'}
          </Text>
          <Pressable style={[estilo.botao, { backgroundColor: cores.perigo }]} onPress={localizarEvento}>
            <Text style={estilo.botaoTexto}>{os.evento_localizado_em ? 'Registrar de novo' : 'Localizei o evento'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={estilo.cartao}>
        <Text style={[estilo.titulo, { fontSize: 16 }]}>Fotos</Text>
        <Text style={[estilo.suave, totalFotos < MINIMO_FOTOS && { color: cores.perigo }]}>
          {totalFotos} de no mínimo {MINIMO_FOTOS}{fotosNaFila > 0 ? ` · ${fotosNaFila} aguardando internet` : ''}
        </Text>
        {podeFotografar ? (
          <Pressable style={estilo.botao} onPress={() => abrirCamera(totalFotos)}>
            <Text style={estilo.botaoTexto}>Tirar fotos</Text>
          </Pressable>
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
      ) : null}

      <View style={[estilo.cartao, { marginBottom: 32 }]}>
        <Text style={[estilo.titulo, { fontSize: 16 }]}>Histórico</Text>
        {eventos.map((e) => (
          <Text key={e.id} style={[estilo.suave, { marginTop: 6 }]}>
            {new Date(e.criado_em).toLocaleString('pt-BR')} · {rotuloStatus[e.status_novo]}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
