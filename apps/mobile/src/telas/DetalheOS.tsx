import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone, { iconeDoTipo, NomeIcone } from '../componentes/Icone';
import Assinatura from '../componentes/Assinatura';
import { assinarOS, minhaAssinatura } from '../lib/assinatura';
import CaixasOS from '../componentes/CaixasOS';
import PontosVistoria from '../componentes/PontosVistoria';
import ExecucaoOS from '../componentes/ExecucaoOS';
import FotosReferencia from '../componentes/FotosReferencia';
import MaterialApoio from '../componentes/MaterialApoio';
import { cores, corDoStatus, fundoDe, sombra } from '../lib/estilo';
import { Caixa, caixasAtuais } from '../lib/caixas';
import { aoMudarFila, enfileirar, itensPendentes } from '../lib/fila';
import { textoSla } from '../lib/formato';
import { posicaoAtual } from '../lib/localizacao';
import { compartilharKmz } from '../lib/kmz';
import { compartilharOsApresentacao } from '../lib/osApresentacao';
import { compartilharRelatorio } from '../lib/relatorioPdf';
import { ponto, supabase } from '../lib/supabase';
import { OrdemServico, proximaAcao, rotuloDaOs, rotuloStatus, StatusOS, variosDias } from '../lib/tipos';
import { ehVistoria, PontoVistoria as Ponto } from '../lib/vistoria';
import CaixaEmenda from './CaixaEmenda';
import PontoVistoria from './PontoVistoria';

type Evento = { id: number; status_novo: StatusOS; criado_em: string };
type Props = {
  os: OrdemServico; euId: string | null; usuario: { nome: string; cargo: string | null };
  voltar: () => void; abrirCamera: (fotosJaFeitas: number) => void;
};
type Aba = 'detalhes' | 'execucao' | 'postes' | 'caixas' | 'fotos' | 'historico';

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
export default function DetalheOS({ os: inicial, euId, usuario, voltar, abrirCamera }: Props) {
  const [os, setOs] = useState(inicial);
  const [aba, setAba] = useState<Aba>('detalhes');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [observacao, setObservacao] = useState(inicial.observacao_tecnico ?? '');
  const [fotosEnviadas, setFotosEnviadas] = useState(0);
  const [fotosNaFila, setFotosNaFila] = useState(0);
  const [pedindoPausa, setPedindoPausa] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [caixaAberta, setCaixaAberta] = useState<{ caixa: Caixa | null; daOs: Caixa[] } | null>(null);
  const [versaoCaixas, setVersaoCaixas] = useState(0);
  const [pontoAberto, setPontoAberto] = useState<{ ponto: Ponto | null; categoria: 'poste' | 'ocorrencia'; daOs: Ponto[] } | null>(null);
  const [versaoPontos, setVersaoPontos] = useState(0);
  const vistoriaMg = ehVistoria(os.tipo);
  const [assinando, setAssinando] = useState(false);
  const [assinadoPor, setAssinadoPor] = useState<string | null>(null);

  const contarFotos = useCallback(async () => {
    const pendentes = await itensPendentes();
    setFotosNaFila(pendentes.filter((i) => i.tipo === 'foto' && i.osId === os.id && (i.tipoAnexo === 'foto_antes' || i.tipoAnexo === 'foto_depois')).length);
    const { count } = await supabase
      .from('os_anexos')
      .select('id', { count: 'exact', head: true })
      .eq('os_id', os.id)
      .in('tipo', ['foto_antes', 'foto_depois']);
    if (count != null) setFotosEnviadas(count);
  }, [os.id]);

  // Assina com a assinatura cadastrada do técnico; na primeira vez abre o quadro para cadastrar.
  async function assinar(confirmar = true) {
    if (!(await minhaAssinatura())) {
      return Alert.alert('Cadastre sua assinatura', 'Assine uma vez no quadro. Depois ela é usada em todas as O.S.', [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Cadastrar', onPress: () => setAssinando(true) },
      ]);
    }
    const aplicar = async () => {
      try {
        await assinarOS(os.id, usuario.nome);
        setAssinadoPor(usuario.nome);
      } catch (e) {
        Alert.alert('Não foi possível assinar', (e as Error).message);
      }
    };
    if (!confirmar) return aplicar();
    Alert.alert(`Assinar a O.S. #${os.numero}?`, 'Sua assinatura cadastrada vai para a O.S. e para o relatório.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Assinar', onPress: aplicar },
    ]);
  }

  useEffect(() => {
    (async () => {
      const pendente = (await itensPendentes()).find((i) => i.tipo === 'foto' && i.osId === os.id && i.tipoAnexo === 'assinatura');
      if (pendente && pendente.tipo === 'foto') return setAssinadoPor(pendente.descricao ?? usuario.nome);
      const { data } = await supabase.from('os_anexos').select('descricao').eq('os_id', os.id).eq('tipo', 'assinatura')
        .order('criado_em', { ascending: false }).limit(1);
      if (data?.[0]) setAssinadoPor(data[0].descricao ?? usuario.nome);
    })();
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
  // Pausada para continuar em outro dia: a ação principal é retomar.
  const continuando = os.status === 'pausada' && !!os.continua_em;
  const acao = continuando ? { status: 'em_execucao' as StatusOS, rotulo: 'Retomar atendimento' } : proximaAcao[os.status];
  const podeEditar = EM_CAMPO.includes(os.status);
  const podeFotografar = os.status === 'em_execucao' || os.status === 'aceita' || os.status === 'devolvida';

  async function avancar() {
    if (!acao) return;
    if (acao.status === 'concluida' && totalFotos < MINIMO_FOTOS) {
      setAba('fotos');
      return Alert.alert('Faltam fotos', `Tire pelo menos ${MINIMO_FOTOS} fotos na horizontal antes de concluir (${totalFotos} até agora).`);
    }
    if (acao.status === 'concluida' && !assinadoPor) {
      const seguir = await new Promise<boolean>((ok) => Alert.alert('O.S. sem assinatura', 'Assinar a O.S. antes de concluir?', [
        { text: 'Assinar O.S.', onPress: () => { assinar(); ok(false); } },
        { text: 'Concluir sem', onPress: () => ok(true) },
      ]));
      if (!seguir) return;
    }
    const agora = new Date().toISOString();
    const campos: Record<string, unknown> = { status: acao.status, observacao_tecnico: observacao || null };
    const hora = campoHora[acao.status];
    // Ao retomar no dia seguinte, a hora de início continua a do primeiro dia.
    if (hora && !continuando) campos[hora] = agora;
    await enfileirar({ tipo: 'os', osId: os.id, campos });
    setOs({ ...os, status: acao.status, observacao_tecnico: observacao || null, continua_em: null });
    setEventos((e) => [...e, { id: -e.length - 1, status_novo: acao.status, criado_em: agora }]);
    if (acao.status === 'concluida') {
      const concluida = { ...os, status: acao.status, observacao_tecnico: observacao || null };
      const caixas = await caixasAtuais(os.id);
      Alert.alert('O.S. concluída', caixas.length
        ? `Enviar o relatório em PDF e o KMZ com as ${caixas.length} caixa(s) trabalhadas?` : 'Enviar o relatório em PDF ao supervisor pelo WhatsApp?', [
        { text: 'Depois', style: 'cancel' },
        ...(caixas.length ? [{ text: 'KMZ das caixas', onPress: () => enviarKmz(concluida) }] : []),
        { text: 'Relatório PDF', onPress: () => enviarRelatorio(concluida) },
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

  async function enviarKmz(alvo: OrdemServico = os) {
    try {
      const caixas = await caixasAtuais(alvo.id);
      if (!caixas.some((c) => c.latitude != null)) return Alert.alert('Sem caixas com localização', 'Registre as caixas com GPS para gerar o KMZ.');
      await compartilharKmz(alvo, caixas);
    } catch (e) {
      Alert.alert('Não foi possível gerar o KMZ', String(e));
    }
  }

  // Roteamento leva vários dias: pausa e continua amanhã, liberando o encerramento do expediente.
  function continuarAmanha() {
    const amanha = new Date(Date.now() + 86400000);
    const data = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
    Alert.alert('Continuar amanhã', 'A O.S. fica pausada e você pode encerrar o expediente. Amanhã toque em "Retomar atendimento".', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pausar até amanhã', onPress: async () => {
        const campos = { status: 'pausada', continua_em: data, pausa_motivo: 'Continua no próximo dia', observacao_tecnico: observacao || null };
        await enfileirar({ tipo: 'os', osId: os.id, campos });
        setOs({ ...os, status: 'pausada', continua_em: data, observacao_tecnico: observacao || null });
        setEventos((e) => [...e, { id: -e.length - 1, status_novo: 'pausada', criado_em: new Date().toISOString() }]);
      } },
    ]);
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

  if (caixaAberta) {
    return (
      <CaixaEmenda osId={os.id} caixa={caixaAberta.caixa} daOs={caixaAberta.daOs} podeEditar={podeEditar} usuario={usuario}
        voltar={() => { setCaixaAberta(null); setVersaoCaixas((v) => v + 1); }} />
    );
  }

  if (pontoAberto) {
    return (
      <PontoVistoria osId={os.id} tipoOs={os.tipo} ponto={pontoAberto.ponto} categoria={pontoAberto.categoria} daOs={pontoAberto.daOs}
        podeEditar={podeEditar} usuario={usuario} voltar={() => { setPontoAberto(null); setVersaoPontos((v) => v + 1); }} />
    );
  }

  const sla = os.sla_limite && !['concluida', 'baixada', 'cancelada'].includes(os.status) ? textoSla(os.sla_limite) : null;
  const corSla = !sla ? cores.suave : sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo;
  const corStatus = corDoStatus[os.status] ?? cores.suave;

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho
        titulo={os.numero ? `O.S. ${os.numero}` : 'O.S. nova'}
        subtitulo={`${os.tipo}${os.ticket_acionamento ? ` · ${os.ticket_acionamento}` : ''}`}
        voltar={voltar}
        acoes={['concluida', 'baixada'].includes(os.status)
          ? [{ icone: 'map-marker-multiple', rotulo: 'KMZ das caixas', aoTocar: () => enviarKmz() },
            { icone: 'file-pdf-box', rotulo: 'Relatório PDF', aoTocar: () => enviarRelatorio() }] : undefined}
        estendido={44}
      />
      <View style={s.resumo}>
        <View style={[s.resumoIcone, { backgroundColor: fundoDe(corStatus) }]}>
          <Icone nome={iconeDoTipo(os.tipo)} tamanho={26} cor={corStatus} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.resumoTitulo} numberOfLines={2}>{os.titulo}</Text>
          <View style={s.resumoSelos}>
            <View style={[s.selo, { backgroundColor: fundoDe(corStatus) }]}>
              <Text style={[s.seloTexto, { color: corStatus }]}>{rotuloDaOs(os)}</Text>
            </View>
            {os.prioridade === 'alta' || os.prioridade === 'emergencia' ? (
              <View style={[s.selo, { backgroundColor: fundoDe(cores.perigo) }]}>
                <Text style={[s.seloTexto, { color: cores.perigo }]}>{os.prioridade === 'alta' ? 'Prioridade alta' : 'Emergência'}</Text>
              </View>
            ) : null}
            {sla ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icone nome={sla.nivel === 'vencido' ? 'clock-alert-outline' : 'clock-outline'} tamanho={15} cor={corSla} />
                <Text style={[s.sla, { color: corSla }]}>{sla.texto.replace('SLA ', '')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={s.abas}>
        {([
          ['detalhes', 'Detalhes', 'information-outline'], ['execucao', 'Execução', 'wrench-outline'],
          ...(vistoriaMg ? [['postes', 'Postes', 'transmission-tower']] : []), ['caixas', 'Caixas', 'package-variant'],
          ['fotos', `Fotos ${totalFotos}/${MINIMO_FOTOS}`, 'camera-outline'], ['historico', 'Histórico', 'history'],
        ] as [Aba, string, NomeIcone][]).map(([valor, rotulo, icone]) => (
          <Pressable key={valor} style={[s.aba, aba === valor && s.abaAtiva]} onPress={() => setAba(valor)}>
            <Icone nome={icone} tamanho={20} cor={aba === valor ? cores.primaria : cores.suave} />
            <Text style={[s.abaTexto, aba === valor && s.abaTextoAtivo]} numberOfLines={1}>{rotulo}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {aba === 'detalhes' ? (
          <>
            {os.reaberta_em && os.reaberta_motivo && !['concluida', 'baixada', 'cancelada'].includes(os.status) ? (
              <Aviso cor={cores.alerta} texto={`Reaberta pelo supervisor: ${os.reaberta_motivo}`} />
            ) : null}
            {os.status === 'devolvida' && os.observacao_supervisor ? (
              <Aviso cor={cores.perigo} texto={`Devolvida pelo supervisor: ${os.observacao_supervisor}`} />
            ) : null}
            {os.status === 'pausada' ? (
              <Aviso cor={cores.alerta} texto={continuando
                ? `Atividade de vários dias: pausada para continuar em ${os.continua_em!.split('-').reverse().join('/')}. Toque em "Retomar atendimento" quando voltar ao campo.`
                : 'Pausada pela refeição. Retoma ao encerrar a refeição.'} />
            ) : null}
            {os.pausa_solicitada_em ? (
              <Aviso cor={cores.alerta} texto={`Pausa solicitada (${os.pausa_motivo ?? ''}). Aguardando o supervisor autorizar.`} />
            ) : null}

            <View style={s.grade}>
              {os.endereco ? (
                <>
                  {/* Rota até o local da O.S. no navegador do celular (Google Maps ou Waze). */}
                  <Acao icone="navigation-variant" rotulo="Rota" cor={cores.primaria}
                    aoTocar={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=${encodeURIComponent(os.endereco!)}`)} />
                  <Acao icone="waze" rotulo="Waze" cor="#2BB7E8"
                    aoTocar={() => Linking.openURL(`https://waze.com/ul?q=${encodeURIComponent(os.endereco!)}&navigate=yes`)} />
                </>
              ) : null}
              {ehCorretiva(os.tipo) && os.status !== 'baixada' && os.status !== 'cancelada' ? (
                <Acao icone="crosshairs-gps" rotulo={os.evento_localizado_em ? 'Evento localizado' : 'Localizei o evento'} cor={cores.perigo}
                  feito={!!os.evento_localizado_em} aoTocar={localizarEvento} />
              ) : null}
              <Acao icone="camera-outline" rotulo={`Fotos ${totalFotos}/${MINIMO_FOTOS}`} cor={cores.primaria} feito={totalFotos >= MINIMO_FOTOS}
                aoTocar={podeFotografar ? () => abrirCamera(totalFotos) : () => setAba('fotos')} />
              <Acao icone="draw-pen" rotulo={assinadoPor ? 'O.S. assinada' : 'Assinar O.S.'} cor={cores.texto2} feito={!!assinadoPor}
                aoTocar={podeEditar && !assinadoPor ? () => assinar() : undefined} />
              {vistoriaMg ? <Acao icone="transmission-tower" rotulo="Postes" cor={cores.primaria} aoTocar={() => setAba('postes')} /> : null}
              <Acao icone="package-variant" rotulo="Caixas" cor={cores.texto2} aoTocar={() => setAba('caixas')} />
              <Acao icone="wrench-outline" rotulo="Execução" cor={cores.texto2} aoTocar={() => setAba('execucao')} />
              {!['baixada', 'cancelada'].includes(os.status) ? (
                <Acao icone="card-account-details-outline" rotulo="O.S. abordagem" cor="#0B3C6E"
                  aoTocar={() => compartilharOsApresentacao(os).catch((e) => Alert.alert('Não foi possível gerar', String(e)))} />
              ) : null}
              {['concluida', 'baixada'].includes(os.status) ? (
                <>
                  <Acao icone="whatsapp" rotulo="Relatório" cor="#25D366" aoTocar={() => enviarRelatorio()} />
                  <Acao icone="map-marker-multiple" rotulo="KMZ caixas" cor="#227E9E" aoTocar={() => enviarKmz()} />
                </>
              ) : null}
            </View>

            <Text style={s.secao}>INFORMAÇÕES</Text>
            <View style={s.grupo}>
            <Info icone="map-marker-outline" rotulo="Endereço / referência" valor={os.endereco} />
            <Info icone="text-box-outline" rotulo="Descrição" valor={os.descricao} />
            <Info icone="ticket-confirmation-outline" rotulo="Ticket de acionamento" valor={os.ticket_acionamento} />
            <Info icone="flag-outline" rotulo="Prioridade" valor={{ baixa: 'Baixa', media: 'Média', alta: 'Alta', emergencia: 'Emergência' }[os.prioridade]} />
            {os.sla_limite ? (
              <Info icone="timer-outline" rotulo="Limite do SLA (4h)" valor={new Date(os.sla_limite).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
            ) : null}
            {ehCorretiva(os.tipo) && os.status !== 'baixada' && os.status !== 'cancelada' ? (
              <Info icone="crosshairs-gps" rotulo="Local do evento"
                valor={os.evento_localizado_em
                  ? `Registrado às ${new Date(os.evento_localizado_em).toLocaleTimeString('pt-BR')}`
                  : 'Ainda não registrado. Toque em "Localizei o evento" (funciona sem internet).'} />
            ) : null}
            <Info icone="draw-pen" rotulo="Assinatura do técnico" valor={assinadoPor ? `Assinada por ${assinadoPor}` : 'Ainda não assinada. Toque em "Assinar O.S.".'} />
            </View>

            {os.origem_ponto_id || os.informado_por ? <FotosReferencia osId={os.id} /> : null}
            <MaterialApoio osId={os.id} />

            <Assinatura aberta={assinando} fechar={() => setAssinando(false)} aoSalvar={() => assinar(false)} />

            {acao ? (
              <View style={s.bloco}>
                <Text style={s.rotulo}>OBSERVAÇÕES DO ATENDIMENTO</Text>
                <TextInput style={s.campo} placeholder="O que foi encontrado, feito, pendências..." multiline
                  value={observacao} onChangeText={setObservacao} />
              </View>
            ) : null}
          </>
        ) : null}

        {aba === 'postes' ? (
          <PontosVistoria osId={os.id} podeEditar={podeEditar} versao={versaoPontos}
            abrir={(ponto, categoria, daOs) => setPontoAberto({ ponto, categoria, daOs })} />
        ) : null}

        {aba === 'caixas' ? (
          <CaixasOS osId={os.id} podeEditar={podeEditar} versao={versaoCaixas} abrir={(caixa, daOs) => setCaixaAberta({ caixa, daOs })} />
        ) : null}

        {aba === 'execucao' ? <ExecucaoOS osId={os.id} podeEditar={podeEditar} euId={euId} /> : null}

        {aba === 'fotos' ? (
          <View style={s.bloco}>
            <Text style={[s.fotosNumero, { color: totalFotos >= MINIMO_FOTOS ? cores.sucesso : cores.perigo }]}>{totalFotos}</Text>
            <Text style={s.valor}>
              de no mínimo {MINIMO_FOTOS} fotos na horizontal{fotosNaFila > 0 ? ` · ${fotosNaFila} aguardando internet` : ''}
            </Text>
            {os.origem_ponto_id || os.informado_por ? <Text style={[s.valor, { marginTop: 8 }]}>As fotos da vistoria aparecem na câmera como guia: repita o mesmo ângulo.</Text> : null}
            {podeFotografar ? (
              <Pressable style={[s.botaoBloco, { backgroundColor: cores.primaria }]} onPress={() => abrirCamera(totalFotos)}>
                <Text style={s.botaoTexto}>Tirar fotos</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {aba === 'fotos' && (os.origem_ponto_id || os.informado_por) ? <FotosReferencia osId={os.id} /> : null}

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
          {os.status === 'em_execucao' && variosDias(os.tipo) ? (
            <Pressable style={[s.botaoRodape, s.botaoSecundario, { flex: 0.85 }]} onPress={continuarAmanha}>
              <Icone nome="calendar-arrow-right" tamanho={20} cor={cores.texto} />
              <Text style={[s.botaoTexto, { color: cores.texto }]} numberOfLines={1}>Seguir amanhã</Text>
            </Pressable>
          ) : os.status === 'em_execucao' && !os.pausa_solicitada_em ? (
            <Pressable style={[s.botaoRodape, s.botaoSecundario, { flex: 0.6 }]} onPress={() => setPedindoPausa(true)}>
              <Icone nome="pause-circle-outline" tamanho={20} cor={cores.texto} />
              <Text style={[s.botaoTexto, { color: cores.texto }]}>Pausa</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.botaoRodape, { backgroundColor: acao.status === 'concluida' ? cores.sucesso : cores.primaria }]} onPress={avancar}>
            <Icone nome={acao.status === 'concluida' ? 'check-circle-outline' : acao.status === 'em_execucao' ? 'play-circle-outline' : 'eye-check-outline'}
              tamanho={20} cor="#fff" />
            <Text style={s.botaoTexto}>{acao.rotulo}</Text>
          </Pressable>
        </View>
      ) : ['concluida', 'baixada'].includes(os.status) ? (
        <View style={s.rodape}>
          <Pressable style={[s.botaoRodape, { backgroundColor: '#25D366' }]} onPress={() => enviarRelatorio()} disabled={gerandoPdf}>
            {gerandoPdf ? <ActivityIndicator color="#fff" /> : <><Icone nome="whatsapp" tamanho={20} cor="#fff" /><Text style={s.botaoTexto}>Enviar relatório (PDF) pelo WhatsApp</Text></>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Acao({ icone, rotulo, cor, aoTocar, feito }: { icone: NomeIcone; rotulo: string; cor: string; aoTocar?: () => void; feito?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [s.acao, pressed && { backgroundColor: cores.selecionado }, !aoTocar && { opacity: 0.45 }]}
      onPress={aoTocar} disabled={!aoTocar}>
      <View style={[s.acaoIcone, { backgroundColor: fundoDe(cor) }]}>
        <Icone nome={icone} tamanho={24} cor={cor} />
        {feito ? <View style={s.acaoFeito}><Icone nome="check" tamanho={11} cor="#fff" /></View> : null}
      </View>
      <Text style={s.acaoRotulo} numberOfLines={2}>{rotulo}</Text>
    </Pressable>
  );
}

function Info({ icone, rotulo, valor }: { icone: NomeIcone; rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <View style={s.info}>
      <Icone nome={icone} tamanho={20} cor={cores.suave} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.infoRotulo}>{rotulo}</Text>
        <Text style={s.valor}>{valor}</Text>
      </View>
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
  resumo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, padding: 16, marginHorizontal: 16, marginTop: -44,
    borderRadius: 20, shadowColor: '#0F2747', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  resumoIcone: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  resumoTitulo: { fontSize: 17, fontWeight: '700', color: cores.texto },
  resumoSelos: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  selo: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  seloTexto: { fontSize: 12, fontWeight: '700' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: cores.cartao, paddingVertical: 8, paddingHorizontal: 4,
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, ...sombra },
  grupo: { backgroundColor: cores.cartao, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden', ...sombra },
  acao: { width: '25%', alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  acaoIcone: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  acaoFeito: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: cores.sucesso,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  acaoRotulo: { fontSize: 12, color: cores.texto, marginTop: 6, textAlign: 'center', paddingHorizontal: 2 },
  secao: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginHorizontal: 16, marginTop: 16, marginBottom: 6 },
  info: { flexDirection: 'row', gap: 14, backgroundColor: cores.cartao, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: cores.linha },
  infoRotulo: { fontSize: 12, color: cores.suave, marginBottom: 2 },
  status: { backgroundColor: cores.cartao, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 5, borderBottomWidth: 1, borderBottomColor: cores.borda },
  statusTexto: { fontSize: 15, fontWeight: '700' },
  sla: { fontSize: 14, fontWeight: '600' },
  abas: { flexDirection: 'row', backgroundColor: '#E2E7EE', borderRadius: 14, padding: 4, marginHorizontal: 16, marginTop: 12, marginBottom: 2 },
  aba: { flex: 1, alignItems: 'center', paddingTop: 7, paddingBottom: 6, borderRadius: 11 },
  abaAtiva: { backgroundColor: cores.cartao, ...sombra },
  abaTexto: { fontSize: 10.5, color: '#5A6576', fontWeight: '700', marginTop: 2 },
  abaTextoAtivo: { color: cores.primaria },
  bloco: { backgroundColor: cores.cartao, marginHorizontal: 16, marginTop: 12, borderRadius: 18, padding: 16, ...sombra },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginBottom: 4 },
  valor: { fontSize: 15, color: cores.texto },
  link: { color: cores.primaria, fontWeight: '600', marginTop: 6 },
  aviso: { backgroundColor: '#FFF8EC', borderLeftWidth: 4, padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 12 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, color: cores.texto, fontSize: 15, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#fff' },
  botaoBloco: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  fotosNumero: { fontSize: 44, fontWeight: '700' },
  evento: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  eventoPonto: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rodape: { backgroundColor: cores.cartao, padding: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  botaoRodape: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
