import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone, { iconeDoTipo, NomeIcone } from '../componentes/Icone';
import { LINK_APK, VERSAO_APP, versaoPublicada } from '../lib/atualizacao';
import { bloqueioDeHoje, rotuloEscala } from '../lib/escala';
import { cores, corDoStatus, fundoDe } from '../lib/estilo';
import { aoMudarFila, itensPendentes } from '../lib/fila';
import { dataCurta, diaSemana, hora, textoSla } from '../lib/formato';
import {
  encerrarExpediente,
  encerrarRefeicao,
  iniciarExpediente,
  iniciarRefeicao,
  Jornada,
  lerJornada,
} from '../lib/jornada';
import { inventarioLocal, pendenciasInventario, precisaFoto } from '../lib/inventario';
import { supabase } from '../lib/supabase';
import { OrdemServico, rotuloDaOs } from '../lib/tipos';

type Props = { nome: string; abrirOS: (os: OrdemServico) => void; abrirInventario: () => void };

const CACHE_OS = 'ordens-cache';
const PESO_PRIORIDADE = { emergencia: 0, alta: 1, media: 2, baixa: 3 };
const PESO_STATUS: Record<string, number> = { em_execucao: 0, pausada: 1, devolvida: 2, enviada: 3, aceita: 4, concluida: 5, baixada: 6, cancelada: 7 };
const ENCERRADAS = ['concluida', 'baixada', 'cancelada'];

// Tela principal do técnico: jornada do dia e lista de atividades (padrão Oracle Field Service).
export default function Atividades({ nome, abrirOS, abrirInventario }: Props) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [pedindoKm, setPedindoKm] = useState(false);
  const [km, setKm] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [semRede, setSemRede] = useState(false);
  const [novaVersao, setNovaVersao] = useState<number | null>(null);
  // Grupos recolhíveis do lobby (padrão Claro): Fechada começa recolhida.
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({ fechada: true });
  const [inventarioFaltam, setInventarioFaltam] = useState(0);

  useEffect(() => {
    // O que está no celular aparece na hora; o servidor atualiza depois (sem internet pode demorar).
    const contar = () => {
      inventarioLocal().then((i) => setInventarioFaltam(i.filter(precisaFoto).length)).catch(() => {});
      pendenciasInventario().then(setInventarioFaltam).catch(() => {});
    };
    contar();
    return aoMudarFila(contar);
  }, []);

  useEffect(() => {
    if (!VERSAO_APP) return;
    versaoPublicada().then((v) => v && v > VERSAO_APP && setNovaVersao(v));
  }, []);

  // Mostra na hora o que está salvo no celular; o servidor atualiza em seguida (sem internet pode demorar).
  useEffect(() => {
    AsyncStorage.getItem(CACHE_OS).then((c) => c && setOrdens((atual) => (atual.length ? atual : JSON.parse(c))));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setJornada(await lerJornada());
    // O banco já limita o técnico às O.S. abertas e às encerradas nos últimos 7 dias.
    const { data, error } = await supabase.from('ordens_servico').select('*');
    if (error || !data) {
      setSemRede(true);
      const cache = await AsyncStorage.getItem(CACHE_OS);
      if (cache) setOrdens(JSON.parse(cache));
    } else {
      setSemRede(false);
      setOrdens(data);
      AsyncStorage.setItem(CACHE_OS, JSON.stringify(data));
    }
    setCarregando(false);
  }, []);

  // Tempo real agrupado: várias mudanças seguidas viram uma só recarga.
  const agrupador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    carregar();
    const emBreve = () => {
      if (agrupador.current) return;
      agrupador.current = setTimeout(() => { agrupador.current = null; carregar(); }, 1500);
    };
    const canal = supabase
      .channel('minhas-os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, emBreve)
      .subscribe();
    const contar = () => itensPendentes().then((i) => setPendentes(i.length));
    contar();
    const pararFila = aoMudarFila(contar);
    return () => {
      if (agrupador.current) clearTimeout(agrupador.current);
      supabase.removeChannel(canal);
      pararFila();
    };
  }, [carregar]);

  const { abertas, encerradas, contagem } = useMemo(() => {
    const ordenar = (a: OrdemServico, b: OrdemServico) =>
      (PESO_STATUS[a.status] ?? 9) - (PESO_STATUS[b.status] ?? 9) ||
      PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade] ||
      (a.sla_limite ?? '9').localeCompare(b.sla_limite ?? '9');
    const ab = ordens.filter((o) => !ENCERRADAS.includes(o.status)).sort(ordenar);
    const en = ordens.filter((o) => ENCERRADAS.includes(o.status)).sort((a, b) => b.numero - a.numero);
    return {
      abertas: ab,
      encerradas: en,
      contagem: {
        novas: ab.filter((o) => o.status === 'enviada').length,
        andamento: ab.filter((o) => ['em_execucao', 'pausada'].includes(o.status)).length,
        concluidas: en.length,
      },
    };
  }, [ordens]);

  async function confirmarKm() {
    if (!jornada) return;
    const valor = parseInt(km, 10);
    if (Number.isNaN(valor)) return Alert.alert(jornada.expedienteId ? 'Informe o km final do odômetro' : 'Informe o km inicial do odômetro');
    if (jornada.expedienteId && jornada.kmInicial != null && valor < jornada.kmInicial) {
      return Alert.alert('Km final menor que o inicial', `O expediente começou com ${jornada.kmInicial} km.`);
    }
    if (jornada.expedienteId) {
      setJornada(await encerrarExpediente(jornada, valor));
    } else {
      const { jornada: nova, rastreando } = await iniciarExpediente(valor);
      setJornada(nova);
      if (inventarioFaltam > 0) {
        Alert.alert('Inventário Matinal', `${inventarioFaltam} ferramenta(s)/EPI precisam de foto neste ciclo de 30 dias.`,
          [{ text: 'Depois', style: 'cancel' }, { text: 'Fazer agora', onPress: abrirInventario }]);
      }
      if (!rastreando) {
        Alert.alert('Localização em segundo plano', 'Para registrar o trajeto completo do dia, permita a localização "o tempo todo" nas configurações do app.');
      }
    }
    setKm('');
    setPedindoKm(false);
  }

  async function pedirExpediente() {
    if (!jornada) return;
    if (jornada.expedienteId) {
      // Status mais recente de cada O.S.: o que ainda está na fila (offline) vale mais que o do servidor.
      const status = new Map(ordens.map((o) => [o.id, o.status as string]));
      // Pausada "para continuar amanhã" (roteamento de vários dias) não impede encerrar o expediente.
      const continua = new Map(ordens.map((o) => [o.id, !!o.continua_em]));
      for (const item of await itensPendentes()) {
        if (item.tipo === 'os' && 'continua_em' in item.campos) continua.set(item.osId, !!item.campos.continua_em);
        if (item.tipo === 'os' && typeof item.campos.status === 'string') status.set(item.osId, item.campos.status);
        if (item.tipo === 'inserir' && item.tabela === 'ordens_servico') status.set(String(item.linha.id), String(item.linha.status));
      }
      const emAndamento = [...status].find(([id, st]) => st === 'em_execucao' || (st === 'pausada' && !continua.get(id)));
      if (emAndamento) {
        const os = ordens.find((o) => o.id === emAndamento[0]);
        return Alert.alert(
          'O.S. em andamento',
          `Conclua ${os ? `a O.S. #${os.numero}` : 'a O.S. em execução'} ou peça ao supervisor para pausá-la antes de encerrar o expediente.`,
        );
      }
    } else {
      const bloqueio = await bloqueioDeHoje();
      if (bloqueio) {
        return Alert.alert('Expediente bloqueado', `Hoje está na sua escala como ${rotuloEscala[bloqueio.tipo].toLowerCase()}.`);
      }
    }
    setPedindoKm(true);
  }

  async function alternarRefeicao() {
    if (!jornada) return;
    setJornada(jornada.inicioRefeicao ? await encerrarRefeicao(jornada) : await iniciarRefeicao(jornada));
    carregar();
  }

  const emExpediente = !!jornada?.expedienteId;
  const emRefeicao = !!jornada?.inicioRefeicao;
  const situacao = !emExpediente ? 'Fora do expediente' : emRefeicao ? 'Em refeição' : 'Em expediente';
  const corSituacao = !emExpediente ? cores.suave : emRefeicao ? cores.alerta : cores.sucesso;
  const desde = emExpediente && jornada?.inicioExpediente ? hora(new Date(jornada.inicioRefeicao ?? jornada.inicioExpediente)) : null;
  const hoje = new Date();

  const sincronizando = semRede || pendentes > 0;
  const topo = (
    <View>
      <Cabecalho titulo="Atividades" subtitulo={`${diaSemana(hoje)}, ${dataCurta(hoje)}${nome ? ` · ${nome}` : ''}`}
        acoes={[
          { icone: semRede ? 'cloud-off-outline' : pendentes > 0 ? 'cloud-upload-outline' : 'cloud-check-outline', rotulo: 'Sincronização',
            selo: pendentes, cor: sincronizando ? '#F5C26B' : undefined,
            aoTocar: () => Alert.alert('Sincronização', semRede ? `Sem internet. ${pendentes} registro(s) salvos no celular.` : pendentes ? `${pendentes} registro(s) enviando.` : 'Tudo enviado.') },
          { icone: 'refresh', rotulo: 'Atualizar', aoTocar: carregar },
        ]} />

      {novaVersao ? (
        <Pressable style={[s.faixa, { backgroundColor: cores.primaria }]} onPress={() => Linking.openURL(LINK_APK)}>
          <Icone nome="download" tamanho={18} cor="#fff" />
          <Text style={[s.faixaTexto, { color: '#fff' }]}>Nova versão do app ({novaVersao}). Toque para atualizar.</Text>
        </Pressable>
      ) : null}
      {inventarioFaltam > 0 ? (
        <Pressable style={[s.faixa, { backgroundColor: '#F3E8FA' }]} onPress={abrirInventario}>
          <Icone nome="toolbox-outline" tamanho={18} cor="#5B3A86" />
          <Text style={[s.faixaTexto, { color: '#5B3A86' }]}>
            Inventário Matinal: {inventarioFaltam} item(ns) para fotografar. Toque para fazer.
          </Text>
          <Icone nome="chevron-right" tamanho={18} cor="#5B3A86" />
        </Pressable>
      ) : null}
      {semRede ? (
        <View style={s.faixa}>
          <Icone nome="wifi-off" tamanho={18} cor="#7A4B00" />
          <Text style={s.faixaTexto}>Sem internet. Tudo que você registrar fica salvo no celular.</Text>
        </View>
      ) : null}

      <View style={s.jornada}>
        <View style={s.jornadaLinha}>
          <View style={[s.jornadaIcone, { backgroundColor: fundoDe(corSituacao) }]}>
            <Icone nome={!emExpediente ? 'truck-outline' : emRefeicao ? 'silverware-fork-knife' : 'truck-fast'} tamanho={22} cor={corSituacao} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.jornadaTexto}>{situacao}</Text>
            <Text style={s.jornadaDesde}>
              {desde ? `desde ${desde}` : 'Inicie o expediente para receber e executar atividades'}
              {emExpediente && jornada?.kmInicial != null ? ` · km inicial ${jornada.kmInicial.toLocaleString('pt-BR')}` : ''}
            </Text>
          </View>
        </View>
        {pedindoKm ? (
          <View style={{ marginTop: 12 }}>
            <TextInput style={s.campo} keyboardType="numeric" value={km} onChangeText={setKm} autoFocus
              placeholder={emExpediente ? 'Km final do odômetro' : 'Km inicial do odômetro'} />
            <View style={s.botoes}>
              <Pressable style={[s.botao, s.botaoSecundario]} onPress={() => { setPedindoKm(false); setKm(''); }}>
                <Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[s.botao, { backgroundColor: emExpediente ? cores.perigo : cores.sucesso }]} onPress={confirmarKm}>
                <Icone nome={emExpediente ? 'stop-circle-outline' : 'play-circle-outline'} tamanho={20} cor="#fff" />
                <Text style={s.botaoTexto}>{emExpediente ? 'Encerrar' : 'Iniciar'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s.botoes}>
            {!emRefeicao ? (
              <Pressable style={[s.botao, emExpediente ? s.botaoContorno : { backgroundColor: cores.sucesso }]} onPress={pedirExpediente}>
                <Icone nome={emExpediente ? 'stop-circle-outline' : 'play-circle-outline'} tamanho={20} cor={emExpediente ? cores.perigo : '#fff'} />
                <Text style={[s.botaoTexto, emExpediente && { color: cores.perigo }]} numberOfLines={1}>{emExpediente ? 'Encerrar expediente' : 'Iniciar expediente'}</Text>
              </Pressable>
            ) : null}
            {emExpediente ? (
              <Pressable style={[s.botao, { backgroundColor: emRefeicao ? cores.sucesso : cores.alerta }]} onPress={alternarRefeicao}>
                <Icone nome={emRefeicao ? 'play-circle-outline' : 'silverware-fork-knife'} tamanho={20} cor="#fff" />
                <Text style={s.botaoTexto}>{emRefeicao ? 'Encerrar refeição' : 'Refeição'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View style={s.resumo}>
        <Resumo numero={contagem.novas} rotulo="Novas" cor={corDoStatus.enviada} icone="bell-ring-outline" />
        <Resumo numero={contagem.andamento} rotulo="Em andamento" cor={corDoStatus.em_execucao} icone="progress-wrench" />
        <Resumo numero={contagem.concluidas} rotulo="Encerradas (7d)" cor={corDoStatus.concluida} icone="check-circle-outline" />
      </View>

    </View>
  );

  const grupos = [
    { chave: 'andamento', rotulo: 'Em andamento', cor: corDoStatus.em_execucao, ordens: abertas.filter((o) => ['em_execucao', 'pausada'].includes(o.status)) },
    { chave: 'pendente', rotulo: 'Pendente', cor: corDoStatus.enviada, ordens: abertas.filter((o) => !['em_execucao', 'pausada'].includes(o.status)) },
    { chave: 'fechada', rotulo: 'Fechada (7 dias)', cor: corDoStatus.concluida, ordens: encerradas },
  ];
  type Linha = { tipo: 'grupo'; chave: string; rotulo: string; cor: string; n: number } | { tipo: 'os'; os: OrdemServico };
  const lista: Linha[] = grupos.filter((g) => g.ordens.length > 0).flatMap((g) => [
    { tipo: 'grupo' as const, chave: g.chave, rotulo: g.rotulo, cor: g.cor, n: g.ordens.length },
    ...(recolhidos[g.chave] ? [] : g.ordens.map((os) => ({ tipo: 'os' as const, os }))),
  ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: cores.fundo }}
      data={lista}
      keyExtractor={(l) => (l.tipo === 'grupo' ? `g-${l.chave}` : l.os.id)}
      ListHeaderComponent={topo}
      ListEmptyComponent={<Text style={s.vazio}>Nenhuma atividade.</Text>}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      renderItem={({ item }) => (item.tipo === 'grupo' ? (
        <Pressable style={s.grupo} onPress={() => setRecolhidos((r) => ({ ...r, [item.chave]: !r[item.chave] }))}>
          <View style={[s.grupoCor, { backgroundColor: item.cor }]} />
          <Text style={s.grupoTexto}>{item.rotulo}</Text>
          <Text style={s.grupoNumero}>{item.n}</Text>
          <Icone nome={recolhidos[item.chave] ? 'chevron-down' : 'chevron-up'} tamanho={22} cor={cores.suave} style={{ marginLeft: 'auto' }} />
        </Pressable>
      ) : <Cartao os={item.os} abrir={abrirOS} />)}
      contentContainerStyle={{ paddingBottom: 16 }}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

function Resumo({ numero, rotulo, cor, icone }: { numero: number; rotulo: string; cor: string; icone: NomeIcone }) {
  return (
    <View style={s.resumoItem}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icone nome={icone} tamanho={18} cor={cor} />
        <Text style={[s.resumoNumero, { color: cor }]}>{numero}</Text>
      </View>
      <Text style={s.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const Cartao = memo(function Cartao({ os, abrir }: { os: OrdemServico; abrir: (os: OrdemServico) => void }) {
  const emAberto = !ENCERRADAS.includes(os.status);
  const sla = os.sla_limite && emAberto ? textoSla(os.sla_limite) : null;
  const corSla = !sla ? cores.suave : sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo;
  const cor = corDoStatus[os.status] ?? cores.suave;
  const urgente = os.prioridade === 'emergencia' || os.prioridade === 'alta';
  return (
    <Pressable style={({ pressed }) => [s.cartao, pressed && { backgroundColor: cores.selecionado }]} onPress={() => abrir(os)}>
      <View style={s.cartaoHora}>
        {sla ? (
          <>
            <Text style={[s.cartaoHoraValor, { color: corSla }]}>
              {new Date(os.sla_limite!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={s.cartaoHoraRotulo}>limite</Text>
          </>
        ) : (
          <Text style={[s.cartaoHoraValor, { color: '#B9B4AF' }]}>—</Text>
        )}
      </View>
      <View style={[s.cartaoFaixa, { backgroundColor: cor }]} />
      <View style={[s.cartaoIcone, { backgroundColor: fundoDe(cor) }]}>
        <Icone nome={iconeDoTipo(os.tipo)} tamanho={22} cor={cor} />
      </View>
      <View style={{ flex: 1, paddingVertical: 12, paddingRight: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {urgente ? <Icone nome="alert" tamanho={16} cor={cores.perigo} /> : null}
          <Text style={s.cartaoTitulo} numberOfLines={1}>{os.titulo}</Text>
        </View>
        <Text style={s.cartaoLinha} numberOfLines={1}>
          {os.tipo}{os.numero ? ` · O.S. ${os.numero}` : ''}{os.ticket_acionamento ? ` · ${os.ticket_acionamento}` : ''}
        </Text>
        {os.endereco ? (
          <View style={s.cartaoMeta}>
            <Icone nome="map-marker-outline" tamanho={14} cor={cores.suave} />
            <Text style={s.cartaoLinha} numberOfLines={1}>{os.endereco}</Text>
          </View>
        ) : null}
        <View style={s.selos}>
          <View style={[s.selo, { backgroundColor: fundoDe(cor) }]}>
            <Text style={[s.seloTexto, { color: cor }]}>{rotuloDaOs(os)}</Text>
          </View>
          {sla ? (
            <View style={s.cartaoMeta}>
              <Icone nome={sla.nivel === 'vencido' ? 'clock-alert-outline' : 'clock-outline'} tamanho={14} cor={corSla} />
              <Text style={[s.slaTexto, { color: corSla }]}>{sla.texto.replace('SLA ', '')}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Icone nome="chevron-right" tamanho={22} cor="#B9B4AF" style={{ marginRight: 6 }} />
    </Pressable>
  );
});

const s = StyleSheet.create({
  grupo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8,
    backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda },
  grupoCor: { width: 14, height: 14, borderRadius: 2 },
  grupoTexto: { fontSize: 15, fontWeight: '700', color: cores.texto },
  grupoNumero: { fontSize: 15, color: cores.suave },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEFD9', paddingHorizontal: 16, paddingVertical: 8 },
  faixaTexto: { flex: 1, color: '#7A4B00', fontSize: 13 },
  jornada: { backgroundColor: cores.cartao, padding: 14, borderBottomWidth: 1, borderBottomColor: cores.borda },
  jornadaLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jornadaIcone: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  jornadaTexto: { fontSize: 16, fontWeight: '700', color: cores.texto },
  jornadaDesde: { fontSize: 13, color: cores.suave, marginTop: 1 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  botao: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', borderRadius: 6, paddingVertical: 11, alignItems: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoContorno: { backgroundColor: cores.cartao, borderWidth: 1.5, borderColor: cores.perigo },
  botaoTexto: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resumo: { flexDirection: 'row', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda },
  resumoItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  resumoNumero: { fontSize: 20, fontWeight: '700' },
  resumoRotulo: { fontSize: 11, color: cores.suave, marginTop: 2 },
  vazio: { color: cores.suave, margin: 16, textAlign: 'center' },
  cartao: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.linha },
  cartaoHora: { width: 58, alignItems: 'center' },
  cartaoHoraValor: { fontSize: 15, fontWeight: '700' },
  cartaoHoraRotulo: { fontSize: 10, color: cores.suave, textTransform: 'uppercase', letterSpacing: 0.4 },
  cartaoFaixa: { width: 3, alignSelf: 'stretch', marginVertical: 10, borderRadius: 2 },
  cartaoIcone: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  cartaoTitulo: { flex: 1, fontSize: 16, fontWeight: '600', color: cores.texto },
  cartaoLinha: { flexShrink: 1, fontSize: 13, color: cores.suave, marginTop: 2 },
  cartaoMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  selos: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  selo: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  slaTexto: { fontSize: 12, fontWeight: '600' },
});
