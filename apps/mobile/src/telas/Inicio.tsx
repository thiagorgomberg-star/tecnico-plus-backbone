import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { cores, corDoStatus, estilo } from '../lib/estilo';
import { aoMudarFila, itensPendentes } from '../lib/fila';
import { hora, textoSla } from '../lib/formato';
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

type Props = { nome: string; abrirOS: (os: OrdemServico) => void; sair: () => void };

const CACHE_OS = 'ordens-cache';
const ORDEM_PRIORIDADE = { emergencia: 0, alta: 1, media: 2, baixa: 3 };

export default function Inicio({ nome, abrirOS, sair }: Props) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [km, setKm] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [semRede, setSemRede] = useState(false);

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
      const ordenadas = [...data].sort(
        (a, b) =>
          ORDEM_PRIORIDADE[a.prioridade as keyof typeof ORDEM_PRIORIDADE] - ORDEM_PRIORIDADE[b.prioridade as keyof typeof ORDEM_PRIORIDADE] ||
          (a.prazo ?? '9').localeCompare(b.prazo ?? '9'),
      );
      setOrdens(ordenadas);
      await AsyncStorage.setItem(CACHE_OS, JSON.stringify(ordenadas));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel('minhas-os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, carregar)
      .subscribe();
    const contar = () => itensPendentes().then((i) => setPendentes(i.length));
    contar();
    const pararFila = aoMudarFila(contar);
    return () => {
      supabase.removeChannel(canal);
      pararFila();
    };
  }, [carregar]);

  async function alternarExpediente() {
    if (!jornada) return;
    const valor = parseInt(km, 10);
    if (Number.isNaN(valor)) return Alert.alert(jornada.expedienteId ? 'Informe o km final do odômetro' : 'Informe o km inicial do odômetro');
    if (jornada.expedienteId && jornada.kmInicial != null && valor < jornada.kmInicial) {
      return Alert.alert('Km final menor que o inicial', `O expediente começou com ${jornada.kmInicial} km.`);
    }
    setJornada(jornada.expedienteId ? await encerrarExpediente(jornada, valor) : await iniciarExpediente(valor));
    setKm('');
  }

  async function alternarRefeicao() {
    if (!jornada?.expedienteId) return Alert.alert('Inicie o expediente antes da refeição');
    setJornada(jornada.inicioRefeicao ? await encerrarRefeicao(jornada) : await iniciarRefeicao(jornada));
    setTimeout(carregar, 1500);
  }

  const emExpediente = !!jornada?.expedienteId;
  const emRefeicao = !!jornada?.inicioRefeicao;
  const situacao = !emExpediente ? 'Fora do expediente' : emRefeicao ? 'Em refeição' : 'Em expediente';
  const corSituacao = !emExpediente ? cores.suave : emRefeicao ? cores.alerta : cores.sucesso;
  const abertas = ordens.filter((o) => !['baixada', 'cancelada'].includes(o.status));
  const encerradas = ordens.filter((o) => ['baixada', 'cancelada'].includes(o.status));

  const cabecalho = (
    <View>
      <View style={s.barra}>
        <View style={{ flex: 1 }}>
          <Text style={s.barraTitulo}>{nome || 'Técnico Plus'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <View style={[s.ponto, { backgroundColor: corSituacao }]} />
            <Text style={s.barraSub}>
              {situacao}
              {emExpediente && jornada?.inicioExpediente ? ` desde ${hora(new Date(jornada.inicioRefeicao ?? jornada.inicioExpediente))}` : ''}
            </Text>
          </View>
        </View>
        <Pressable onPress={sair}><Text style={s.barraSub}>Sair</Text></Pressable>
      </View>

      {(semRede || pendentes > 0) && (
        <View style={s.faixa}>
          <Text style={s.faixaTexto}>
            {semRede ? 'Sem internet. Mostrando a última lista salva. ' : ''}
            {pendentes > 0 ? `${pendentes} registro(s) aguardando envio.` : ''}
          </Text>
        </View>
      )}

      <View style={s.painel}>
        {!emRefeicao && (
          <TextInput style={[estilo.campo, { marginTop: 0 }]} keyboardType="numeric" value={km} onChangeText={setKm}
            placeholder={emExpediente ? 'Km final do odômetro' : 'Km inicial do odômetro'} />
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!emRefeicao && (
            <Pressable style={[s.acao, { backgroundColor: emExpediente ? cores.perigo : cores.primaria }]} onPress={alternarExpediente}>
              <Text style={s.acaoTexto}>{emExpediente ? 'Encerrar expediente' : 'Iniciar expediente'}</Text>
            </Pressable>
          )}
          {emExpediente && (
            <Pressable style={[s.acao, { backgroundColor: emRefeicao ? cores.sucesso : cores.alerta }]} onPress={alternarRefeicao}>
              <Text style={s.acaoTexto}>{emRefeicao ? 'Encerrar refeição' : 'Iniciar refeição'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={s.secao}>ATIVIDADES ({abertas.length})</Text>
    </View>
  );

  const cartao = (os: OrdemServico) => {
    const emAberto = !['concluida', 'baixada', 'cancelada'].includes(os.status);
    const atrasada = os.prazo != null && new Date(os.prazo) < new Date() && emAberto;
    const sla = os.sla_limite && emAberto ? textoSla(os.sla_limite) : null;
    return (
      <Pressable style={s.cartao} onPress={() => abrirOS(os)}>
        <View style={[s.faixaStatus, { backgroundColor: corDoStatus[os.status] }]} />
        <View style={{ flex: 1, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.numero}>O.S. {os.numero}{os.ticket_acionamento ? ` · Ticket ${os.ticket_acionamento}` : ''} · {os.tipo}</Text>
            <Text style={[s.status, { color: corDoStatus[os.status] }]}>{rotuloStatus[os.status]}</Text>
          </View>
          <Text style={s.titulo}>{os.titulo}</Text>
          {os.endereco ? <Text style={s.linha} numberOfLines={1}>{os.endereco}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            {os.prioridade === 'emergencia' || os.prioridade === 'alta' ? (
              <Text style={[s.linha, { color: cores.perigo, fontWeight: '600' }]}>Prioridade {os.prioridade}</Text>
            ) : null}
            {sla ? (
              <Text style={[s.linha, { fontWeight: '600', color: sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo }]}>
                {sla.texto}
              </Text>
            ) : null}
            {os.prazo ? (
              <Text style={[s.linha, atrasada && { color: cores.perigo, fontWeight: '600' }]}>
                {atrasada ? 'Atrasada · ' : 'Prazo '}{new Date(os.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <FlatList
      style={estilo.tela}
      data={[...abertas, ...encerradas]}
      keyExtractor={(os) => os.id}
      ListHeaderComponent={cabecalho}
      ListEmptyComponent={<Text style={[estilo.suave, { margin: 16 }]}>Nenhuma atividade para você.</Text>}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      renderItem={({ item, index }) => (
        <>
          {index === abertas.length && encerradas.length > 0 ? <Text style={s.secao}>ENCERRADAS NA SEMANA</Text> : null}
          {cartao(item)}
        </>
      )}
      contentContainerStyle={{ paddingBottom: 32 }}
    />
  );
}

const s = StyleSheet.create({
  barra: { backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  barraTitulo: { color: cores.cabecalhoTexto, fontSize: 20, fontWeight: '600' },
  barraSub: { color: '#D5D1CD', fontSize: 14 },
  ponto: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  faixa: { backgroundColor: '#FCEFD9', paddingHorizontal: 16, paddingVertical: 8 },
  faixaTexto: { color: '#7A4B00', fontSize: 13 },
  painel: { backgroundColor: cores.cartao, padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: cores.borda },
  acao: { flex: 1, borderRadius: 6, paddingVertical: 14, alignItems: 'center' },
  acaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secao: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginHorizontal: 16, marginTop: 18, marginBottom: 6 },
  cartao: { flexDirection: 'row', backgroundColor: cores.cartao, marginHorizontal: 12, marginTop: 8, borderRadius: 6, overflow: 'hidden',
    borderWidth: 1, borderColor: cores.borda },
  faixaStatus: { width: 6 },
  numero: { color: cores.suave, fontSize: 12, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '700' },
  titulo: { color: cores.texto, fontSize: 16, fontWeight: '600', marginTop: 2 },
  linha: { color: cores.suave, fontSize: 13, marginTop: 2 },
});
