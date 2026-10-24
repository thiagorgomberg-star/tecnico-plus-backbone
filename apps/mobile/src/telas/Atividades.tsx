import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { LINK_APK, VERSAO_APP, versaoPublicada } from '../lib/atualizacao';
import { bloqueioDeHoje, rotuloEscala } from '../lib/escala';
import { cores, corDoStatus } from '../lib/estilo';
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
import { supabase } from '../lib/supabase';
import { OrdemServico, rotuloStatus } from '../lib/tipos';

type Props = { nome: string; abrirOS: (os: OrdemServico) => void };

const CACHE_OS = 'ordens-cache';
const PESO_PRIORIDADE = { emergencia: 0, alta: 1, media: 2, baixa: 3 };
const PESO_STATUS: Record<string, number> = { em_execucao: 0, pausada: 1, devolvida: 2, enviada: 3, aceita: 4, concluida: 5, baixada: 6, cancelada: 7 };
const ENCERRADAS = ['concluida', 'baixada', 'cancelada'];

// Tela principal do técnico: jornada do dia e lista de atividades (padrão Oracle Field Service).
export default function Atividades({ nome, abrirOS }: Props) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [pedindoKm, setPedindoKm] = useState(false);
  const [km, setKm] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [semRede, setSemRede] = useState(false);
  const [novaVersao, setNovaVersao] = useState<number | null>(null);
  const [verEncerradas, setVerEncerradas] = useState(false);

  useEffect(() => {
    if (!VERSAO_APP) return;
    versaoPublicada().then((v) => v && v > VERSAO_APP && setNovaVersao(v));
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
        andamento: ab.filter((o) => ['em_execucao', 'pausada', 'aceita', 'devolvida'].includes(o.status)).length,
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
      for (const item of await itensPendentes()) {
        if (item.tipo === 'os' && typeof item.campos.status === 'string') status.set(item.osId, item.campos.status);
        if (item.tipo === 'inserir' && item.tabela === 'ordens_servico') status.set(String(item.linha.id), String(item.linha.status));
      }
      const emAndamento = [...status].find(([, st]) => st === 'em_execucao' || st === 'pausada');
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

  const topo = (
    <View>
      <Cabecalho titulo="Atividades" subtitulo={`${diaSemana(hoje)}, ${dataCurta(hoje)} · ${nome}`} />

      {novaVersao ? (
        <Pressable style={[s.faixa, { backgroundColor: cores.primaria }]} onPress={() => Linking.openURL(LINK_APK)}>
          <Text style={[s.faixaTexto, { color: '#fff' }]}>Nova versão do app ({novaVersao}). Toque para atualizar. Seus dados continuam.</Text>
        </Pressable>
      ) : null}
      {semRede || pendentes > 0 ? (
        <View style={s.faixa}>
          <Text style={s.faixaTexto}>
            {semRede ? 'Sem internet. Tudo que você registrar fica salvo no celular. ' : ''}
            {pendentes > 0 ? `${pendentes} registro(s) aguardando envio.` : ''}
          </Text>
        </View>
      ) : null}

      <View style={s.jornada}>
        <View style={s.jornadaLinha}>
          <View style={[s.ponto, { backgroundColor: corSituacao }]} />
          <Text style={s.jornadaTexto}>{situacao}</Text>
          {desde ? <Text style={s.jornadaDesde}>desde {desde}</Text> : null}
        </View>
        {pedindoKm ? (
          <View style={{ marginTop: 10 }}>
            <TextInput style={s.campo} keyboardType="numeric" value={km} onChangeText={setKm} autoFocus
              placeholder={emExpediente ? 'Km final do odômetro' : 'Km inicial do odômetro'} />
            <View style={s.botoes}>
              <Pressable style={[s.botao, s.botaoSecundario]} onPress={() => { setPedindoKm(false); setKm(''); }}>
                <Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[s.botao, { backgroundColor: emExpediente ? cores.perigo : cores.sucesso }]} onPress={confirmarKm}>
                <Text style={s.botaoTexto}>{emExpediente ? 'Encerrar' : 'Iniciar'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s.botoes}>
            {!emRefeicao ? (
              <Pressable style={[s.botao, { backgroundColor: emExpediente ? cores.perigo : cores.sucesso }]} onPress={pedirExpediente}>
                <Text style={s.botaoTexto}>{emExpediente ? 'Encerrar expediente' : 'Iniciar expediente'}</Text>
              </Pressable>
            ) : null}
            {emExpediente ? (
              <Pressable style={[s.botao, { backgroundColor: emRefeicao ? cores.sucesso : cores.alerta }]} onPress={alternarRefeicao}>
                <Text style={s.botaoTexto}>{emRefeicao ? 'Encerrar refeição' : 'Refeição'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View style={s.resumo}>
        <Resumo numero={contagem.novas} rotulo="Novas" cor={corDoStatus.enviada} />
        <Resumo numero={contagem.andamento} rotulo="Em andamento" cor={corDoStatus.em_execucao} />
        <Resumo numero={contagem.concluidas} rotulo="Encerradas (7 dias)" cor={corDoStatus.concluida} />
      </View>

      <Text style={s.secao}>EM ABERTO ({abertas.length})</Text>
    </View>
  );

  const lista = verEncerradas ? [...abertas, ...encerradas] : abertas;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: cores.fundo }}
      data={lista}
      keyExtractor={(os) => os.id}
      ListHeaderComponent={topo}
      ListEmptyComponent={<Text style={s.vazio}>Nenhuma atividade em aberto.</Text>}
      ListFooterComponent={
        encerradas.length > 0 ? (
          <Pressable onPress={() => setVerEncerradas(!verEncerradas)} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: cores.primaria, fontWeight: '600' }}>
              {verEncerradas ? 'Ocultar encerradas' : `Ver encerradas da semana (${encerradas.length})`}
            </Text>
          </Pressable>
        ) : undefined
      }
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      renderItem={({ item, index }) => (
        <>
          {verEncerradas && index === abertas.length ? <Text style={s.secao}>ENCERRADAS NA SEMANA</Text> : null}
          <Cartao os={item} abrir={abrirOS} />
        </>
      )}
      contentContainerStyle={{ paddingBottom: 16 }}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

function Resumo({ numero, rotulo, cor }: { numero: number; rotulo: string; cor: string }) {
  return (
    <View style={s.resumoItem}>
      <Text style={[s.resumoNumero, { color: cor }]}>{numero}</Text>
      <Text style={s.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const Cartao = memo(function Cartao({ os, abrir }: { os: OrdemServico; abrir: (os: OrdemServico) => void }) {
  const emAberto = !ENCERRADAS.includes(os.status);
  const sla = os.sla_limite && emAberto ? textoSla(os.sla_limite) : null;
  const corSla = !sla ? cores.suave : sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo;
  const cor = corDoStatus[os.status] ?? cores.suave;
  return (
    <Pressable style={({ pressed }) => [s.cartao, pressed && { backgroundColor: cores.selecionado }]} onPress={() => abrir(os)}>
      <View style={[s.cartaoFaixa, { backgroundColor: cor }]} />
      <View style={s.cartaoHora}>
        {sla ? (
          <>
            <Text style={[s.cartaoHoraValor, { color: corSla }]}>
              {new Date(os.sla_limite!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={s.cartaoHoraRotulo}>SLA</Text>
          </>
        ) : (
          <Text style={s.cartaoHoraRotulo}>#{os.numero || '—'}</Text>
        )}
      </View>
      <View style={{ flex: 1, paddingVertical: 10, paddingRight: 12 }}>
        <Text style={s.cartaoTitulo} numberOfLines={1}>{os.titulo}</Text>
        <Text style={s.cartaoLinha} numberOfLines={1}>
          {os.numero ? `#${os.numero} · ` : ''}{os.tipo}{os.endereco ? ` · ${os.endereco}` : ''}
        </Text>
        <View style={s.selos}>
          <Text style={[s.selo, { color: cor, borderColor: cor }]}>{rotuloStatus[os.status]}</Text>
          {os.prioridade === 'emergencia' || os.prioridade === 'alta' ? (
            <Text style={[s.selo, { color: cores.perigo, borderColor: cores.perigo }]}>{os.prioridade === 'alta' ? 'Alta' : 'Emergência'}</Text>
          ) : null}
          {sla ? <Text style={[s.seloTexto, { color: corSla }]}>{sla.texto}</Text> : null}
        </View>
      </View>
      <Text style={s.seta}>›</Text>
    </Pressable>
  );
});

const s = StyleSheet.create({
  faixa: { backgroundColor: '#FCEFD9', paddingHorizontal: 16, paddingVertical: 8 },
  faixaTexto: { color: '#7A4B00', fontSize: 13 },
  jornada: { backgroundColor: cores.cartao, padding: 14, borderBottomWidth: 1, borderBottomColor: cores.borda },
  jornadaLinha: { flexDirection: 'row', alignItems: 'center' },
  ponto: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  jornadaTexto: { fontSize: 15, fontWeight: '600', color: cores.texto },
  jornadaDesde: { fontSize: 13, color: cores.suave, marginLeft: 6 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  botao: { flex: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resumo: { flexDirection: 'row', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda },
  resumoItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  resumoNumero: { fontSize: 22, fontWeight: '700' },
  resumoRotulo: { fontSize: 11, color: cores.suave, marginTop: 2 },
  secao: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginHorizontal: 16, marginTop: 16, marginBottom: 6 },
  vazio: { color: cores.suave, margin: 16, textAlign: 'center' },
  cartao: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda },
  cartaoFaixa: { width: 5, alignSelf: 'stretch' },
  cartaoHora: { width: 62, alignItems: 'center' },
  cartaoHoraValor: { fontSize: 15, fontWeight: '700' },
  cartaoHoraRotulo: { fontSize: 11, color: cores.suave },
  cartaoTitulo: { fontSize: 16, fontWeight: '600', color: cores.texto },
  cartaoLinha: { fontSize: 13, color: cores.suave, marginTop: 2 },
  selos: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  selo: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  seloTexto: { fontSize: 12, fontWeight: '600' },
  seta: { fontSize: 24, color: cores.borda, paddingRight: 10 },
});
