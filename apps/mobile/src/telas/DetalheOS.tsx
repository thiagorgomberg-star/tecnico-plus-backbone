import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import ExecucaoOS from '../componentes/ExecucaoOS';
import MaterialApoio from '../componentes/MaterialApoio';
import { cores, corDoStatus } from '../lib/estilo';
import { aoMudarFila, enfileirar, itensPendentes } from '../lib/fila';
import { textoSla } from '../lib/formato';
import { posicaoAtual } from '../lib/localizacao';
import { compartilharRelatorio } from '../lib/relatorioPdf';
import { ponto, supabase } from '../lib/supabase';
import { OrdemServico, proximaAcao, rotuloStatus, StatusOS } from '../lib/tipos';

type Evento = { id: number; status_novo: StatusOS; criado_em: string };
type Props = { os: OrdemServico; euId: string | null; voltar: () => void; abrirCamera: (fotosJaFeitas: number) => void };
type Aba = 'detalhes' | 'execucao' | 'fotos' | 'historico';

const MINIMO_FOTOS = 10;
// Campo que guarda a hora real de cada etapa (enviada mesmo se a ação foi offline).
const campoHora: Partial<Record<StatusOS, string>> = {
  aceita: 'aceita_em',
  em_execucao: 'iniciada_em',
  concluida: 'concluida_em',
};
const ehCorretiva = (tipo: string) => /corretiva/i.test(tipo);
const EM_CAMPO: StatusOS[] = ['aceita', 'em_execucao', 'pausada', 'devolvida'];

// Detalhe da atividade em abas, com a ação principal fixa no rodapé (padrão Oracle Field Service).
export default function DetalheOS({ os: inicial, euId, voltar, abrirCamera }: Props) {
  const [os, setOs] = useState(inicial);
  const [aba, setAba] = useState<Aba>('detalhes');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [observacao, setObservacao] = useState(inicial.observacao_tecnico ?? '');
  const [fotosEnviadas, setFotosEnviadas] = useState(0);
  const [fotosNaFila, setFotosNaFila] = useState(0);
  const [pedindoPausa, setPedindoPausa] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);

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
  const podeEditar = EM_CAMPO.includes(os.status);
  const podeFotografar = os.status === 'em_execucao' || os.status === 'aceita' || os.status === 'devolvida';

  async function avancar() {
    if (!acao) return;
    if (acao.status === 'concluida' && totalFotos < MINIMO_FOTOS) {
      setAba('fotos');
      return Alert.alert('Faltam fotos', `Tire pelo menos ${MINIMO_FOTOS} fotos na horizontal antes de concluir (${totalFotos} até agora).`);
    }
    const agora = new Date().toISOString();
    const campos: Record<string, unknown> = { status: acao.status, observacao_tecnico: observacao || null };
    const hora = campoHora[acao.status];
    if (hora) campos[hora] = agora;
    await enfileirar({ tipo: 'os', osId: os.id, campos });
    setOs({ ...os, status: acao.status, observacao_tecnico: observacao || null });
    setEventos((e) => [...e, { id: -e.length - 1, status_novo: acao.status, criado_em: agora }]);
    if (acao.status === 'concluida') {
      const concluida = { ...os, status: acao.status, observacao_tecnico: observacao || null };
      Alert.alert('O.S. concluída', 'Enviar o relatório em PDF ao supervisor pelo WhatsApp?', [
        { text: 'Depois', style: 'cancel' },
        { text: 'Enviar', onPress: () => enviarRelatorio(concluida) },
      ]);
    }
  }

  async function enviarRelatorio(alvo: OrdemServico = os) {
    if (gerandoPdf) return;
    setGerandoPdf(true);
    try {
      await compartilharRelatorio(alvo);
    } catch (e) {
      Alert.alert('Não foi possível gerar o relatório', String(e));
    } finally {
      setGerandoPdf(false);
    }
  }

  async function pedirPausa() {
    if (!motivoPausa.trim()) return Alert.alert('Informe o motivo da pausa');
    const agora = new Date().toISOString();
    await enfileirar({ tipo: 'os', osId: os.id, campos: { pausa_solicitada_em: agora, pausa_motivo: motivoPausa.trim() } });
    setOs({ ...os, pausa_solicitada_em: agora, pausa_motivo: motivoPausa.trim() });
    setPedindoPausa(false);
    Alert.alert('Pausa solicitada', 'O supervisor foi avisado. A O.S. continua em execução até ele autorizar.');
  }

  // Funciona sem internet: o GPS do celular não depende de dados móveis.
  async function localizarEvento() {
    const pos = await posicaoAtual();
    if (!pos) return Alert.alert('Permita o acesso à localização para registrar o evento');
    const agora = new Date().toISOString();
    await enfileirar({
      tipo: 'os',
      osId: os.id,
      campos: { evento_localizado_em: agora, evento_posicao: ponto(pos.latitude, pos.longitude), evento_precisao_m: pos.accuracy },
    });
    setOs({ ...os, evento_localizado_em: agora });
    Alert.alert('Evento localizado', `Posição registrada com precisão de ${Math.round(pos.accuracy ?? 0)} m.`);
  }

  const sla = os.sla_limite && !['concluida', 'baixada', 'cancelada'].includes(os.status) ? textoSla(os.sla_limite) : null;
  const corSla = !sla ? cores.suave : sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo;
  const corStatus = corDoStatus[os.status] ?? cores.suave;

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho
        titulo={os.titulo}
        subtitulo={`${os.numero ? `O.S. #${os.numero}` : 'O.S. nova'} · ${os.tipo}${os.ticket_acionamento ? ` · ${os.ticket_acionamento}` : ''}`}
        voltar={voltar}
      />
      <View style={[s.status, { borderLeftColor: corStatus }]}>
        <Text style={[s.statusTexto, { color: corStatus }]}>{rotuloStatus[os.status]}</Text>
        {sla ? <Text style={[s.sla, { color: corSla }]}>{sla.texto}</Text> : null}
      </View>

      <View style={s.abas}>
        {([['detalhes', 'Detalhes'], ['execucao', 'Execução'], ['fotos', `Fotos ${totalFotos}/${MINIMO_FOTOS}`], ['historico', 'Histórico']] as [Aba, string][]).map(([valor, rotulo]) => (
          <Pressable key={valor} style={[s.aba, aba === valor && s.abaAtiva]} onPress={() => setAba(valor)}>
            <Text style={[s.abaTexto, aba === valor && s.abaTextoAtivo]} numberOfLines={1}>{rotulo}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {aba === 'detalhes' ? (
          <>
            {os.status === 'devolvida' && os.observacao_supervisor ? (
              <Aviso cor={cores.perigo} texto={`Devolvida pelo supervisor: ${os.observacao_supervisor}`} />
            ) : null}
            {os.status === 'pausada' ? <Aviso cor={cores.alerta} texto="Pausada pela refeição. Retoma ao encerrar a refeição." /> : null}
            {os.pausa_solicitada_em ? (
              <Aviso cor={cores.alerta} texto={`Pausa solicitada (${os.pausa_motivo ?? ''}). Aguardando o supervisor autorizar.`} />
            ) : null}

            <Campo rotulo="Endereço / referência" valor={os.endereco}>
              {os.endereco ? (
                <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco!)}`)}>
                  <Text style={s.link}>Abrir no mapa ›</Text>
                </Pressable>
              ) : null}
            </Campo>
            <Campo rotulo="Descrição" valor={os.descricao} />
            <Campo rotulo="Prioridade" valor={{ baixa: 'Baixa', media: 'Média', alta: 'Alta', emergencia: 'Emergência' }[os.prioridade]} />
            {os.sla_limite ? (
              <Campo rotulo="Limite do SLA (4h)" valor={new Date(os.sla_limite).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
            ) : null}

            {ehCorretiva(os.tipo) && os.status !== 'baixada' && os.status !== 'cancelada' ? (
              <View style={s.bloco}>
                <Text style={s.rotulo}>LOCAL DO EVENTO</Text>
                <Text style={s.valor}>
                  {os.evento_localizado_em
                    ? `Registrado às ${new Date(os.evento_localizado_em).toLocaleTimeString('pt-BR')}`
                    : 'Ainda não registrado. Funciona mesmo sem internet.'}
                </Text>
                <Pressable style={[s.botaoBloco, { backgroundColor: cores.perigo }]} onPress={localizarEvento}>
                  <Text style={s.botaoTexto}>{os.evento_localizado_em ? 'Registrar de novo' : 'Localizei o evento'}</Text>
                </Pressable>
              </View>
            ) : null}

            <MaterialApoio osId={os.id} />

            {acao ? (
              <View style={s.bloco}>
                <Text style={s.rotulo}>OBSERVAÇÕES DO ATENDIMENTO</Text>
                <TextInput style={s.campo} placeholder="O que foi encontrado, feito, pendências..." multiline
                  value={observacao} onChangeText={setObservacao} />
              </View>
            ) : null}
          </>
        ) : null}

        {aba === 'execucao' ? <ExecucaoOS osId={os.id} podeEditar={podeEditar} euId={euId} /> : null}

        {aba === 'fotos' ? (
          <View style={s.bloco}>
            <Text style={[s.fotosNumero, { color: totalFotos >= MINIMO_FOTOS ? cores.sucesso : cores.perigo }]}>{totalFotos}</Text>
            <Text style={s.valor}>
              de no mínimo {MINIMO_FOTOS} fotos na horizontal{fotosNaFila > 0 ? ` · ${fotosNaFila} aguardando internet` : ''}
            </Text>
            {podeFotografar ? (
              <Pressable style={[s.botaoBloco, { backgroundColor: cores.primaria }]} onPress={() => abrirCamera(totalFotos)}>
                <Text style={s.botaoTexto}>Tirar fotos</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {aba === 'historico' ? (
          <View style={s.bloco}>
            {eventos.map((e) => (
              <View key={e.id} style={s.evento}>
                <View style={[s.eventoPonto, { backgroundColor: corDoStatus[e.status_novo] ?? cores.suave }]} />
                <Text style={s.valor}>
                  <Text style={{ fontWeight: '600' }}>{rotuloStatus[e.status_novo]}</Text>
                  {'  '}{new Date(e.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {pedindoPausa ? (
        <View style={s.rodape}>
          <TextInput style={[s.campo, { minHeight: 44 }]} placeholder="Motivo da pausa (ex.: chuva, falta de material)" value={motivoPausa}
            onChangeText={setMotivoPausa} autoFocus />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[s.botaoRodape, s.botaoSecundario]} onPress={() => setPedindoPausa(false)}>
              <Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text>
            </Pressable>
            <Pressable style={[s.botaoRodape, { backgroundColor: cores.alerta }]} onPress={pedirPausa}>
              <Text style={s.botaoTexto}>Enviar pedido</Text>
            </Pressable>
          </View>
        </View>
      ) : acao ? (
        <View style={[s.rodape, { flexDirection: 'row', gap: 8 }]}>
          {os.status === 'em_execucao' && !os.pausa_solicitada_em ? (
            <Pressable style={[s.botaoRodape, s.botaoSecundario, { flex: 0.6 }]} onPress={() => setPedindoPausa(true)}>
              <Text style={[s.botaoTexto, { color: cores.texto }]}>Pedir pausa</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.botaoRodape, { backgroundColor: acao.status === 'concluida' ? cores.sucesso : cores.primaria }]} onPress={avancar}>
            <Text style={s.botaoTexto}>{acao.rotulo}</Text>
          </Pressable>
        </View>
      ) : ['concluida', 'baixada'].includes(os.status) ? (
        <View style={s.rodape}>
          <Pressable style={[s.botaoRodape, { backgroundColor: '#25D366' }]} onPress={() => enviarRelatorio()} disabled={gerandoPdf}>
            {gerandoPdf ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>Enviar relatório (PDF) pelo WhatsApp</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Campo({ rotulo, valor, children }: { rotulo: string; valor: string | null | undefined; children?: React.ReactNode }) {
  if (!valor) return null;
  return (
    <View style={s.bloco}>
      <Text style={s.rotulo}>{rotulo.toUpperCase()}</Text>
      <Text style={s.valor}>{valor}</Text>
      {children}
    </View>
  );
}

function Aviso({ cor, texto }: { cor: string; texto: string }) {
  return (
    <View style={[s.aviso, { borderLeftColor: cor }]}>
      <Text style={[s.valor, { color: cor }]}>{texto}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  status: { backgroundColor: cores.cartao, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 5, borderBottomWidth: 1, borderBottomColor: cores.borda },
  statusTexto: { fontSize: 15, fontWeight: '700' },
  sla: { fontSize: 14, fontWeight: '600' },
  abas: { flexDirection: 'row', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda },
  aba: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: cores.primaria },
  abaTexto: { fontSize: 13, color: cores.suave, fontWeight: '600' },
  abaTextoAtivo: { color: cores.primaria },
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginBottom: 4 },
  valor: { fontSize: 15, color: cores.texto },
  link: { color: cores.primaria, fontWeight: '600', marginTop: 6 },
  aviso: { backgroundColor: '#FFF8EC', borderLeftWidth: 4, padding: 12, borderBottomWidth: 1, borderBottomColor: cores.borda },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 15, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#fff' },
  botaoBloco: { borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  fotosNumero: { fontSize: 44, fontWeight: '700' },
  evento: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  eventoPonto: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rodape: { backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda, padding: 12 },
  botaoRodape: { flex: 1, borderRadius: 6, paddingVertical: 14, alignItems: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
