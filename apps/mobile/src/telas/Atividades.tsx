import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone, { iconeDoTipo, NomeIcone } from '../componentes/Icone';
import { LINK_APK, VERSAO_APP, versaoPublicada } from '../lib/atualizacao';
import { bloqueioDeHoje, rotuloEscala } from '../lib/escala';
import { cores, corDoStatus, fundoDe, sombra } from '../lib/estilo';
import { aoMudarFila, itensPendentes } from '../lib/fila';
import { dataCurta, diaSemana, hora, textoSla } from '../lib/formato';
import {
  encerrarExpediente,
  encerrarRefeicao,
  iniciarExpediente,
  iniciarRefeicao,
  Jornada,
  lerJornada,
  ultimoKm,
} from '../lib/jornada';
import { abrirAjusteBateria, garantirRastreio, SituacaoRastreio } from '../lib/rastreio';
import { inventarioLocal, pendenciasInventario, precisaFoto } from '../lib/inventario';
import { supabase } from '../lib/supabase';
import { MeuVeiculo, meuVeiculo } from '../lib/veiculo';
import { OrdemServico, rotuloDaOs } from '../lib/tipos';

type Props = { nome: string; abrirOS: (os: OrdemServico) => void; abrirInventario: () => void; iniciarAtividade: () => void };

const CACHE_OS = 'ordens-cache';
const PESO_PRIORIDADE = { emergencia: 0, alta: 1, media: 2, baixa: 3 };
const PESO_STATUS: Record<string, number> = { em_execucao: 0, pausada: 1, devolvida: 2, enviada: 3, aceita: 4, concluida: 5, baixada: 6, cancelada: 7 };
const ENCERRADAS = ['concluida', 'baixada', 'cancelada'];
type Grupo = 'andamento' | 'pendente' | 'fechada';
const saudacao = (d: Date) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');
const duracao = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

// Tela principal do técnico: cartão do expediente sobre o topo e as O.S. separadas em abas.
export default function Atividades({ nome, abrirOS, abrirInventario, iniciarAtividade }: Props) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [pedindoKm, setPedindoKm] = useState(false);
  const [km, setKm] = useState('');
  const [kmAnterior, setKmAnterior] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [semRede, setSemRede] = useState(false);
  const [novaVersao, setNovaVersao] = useState<number | null>(null);
  // Aba da lista (Em andamento / Pendentes / Fechadas); null = escolhe sozinha a primeira com O.S.
  const [filtro, setFiltro] = useState<Grupo | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [placa, setPlaca] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [inventarioFaltam, setInventarioFaltam] = useState(0);
  const [rastreio, setRastreio] = useState<SituacaoRastreio | null>(null);

  // Relógio do expediente (atualiza a cada 30 s) e placa do veículo (do cache, funciona offline).
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    meuVeiculo(false).then((v) => setPlaca(v?.placa ?? null)).catch(() => {});
    return () => clearInterval(t);
  }, []);

  // Confere o trajeto a cada minuto e ao voltar para o app; religa o GPS se o Android tiver parado.
  useEffect(() => {
    const conferir = () => garantirRastreio().then(setRastreio).catch(() => {});
    conferir();
    const timer = setInterval(conferir, 60_000);
    const aoVoltar = AppState.addEventListener('change', (e) => e === 'active' && conferir());
    return () => { clearInterval(timer); aoVoltar.remove(); };
  }, [jornada?.expedienteId]);

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
    if (!jornada || ocupado) return;
    const valor = parseInt(km, 10);
    if (Number.isNaN(valor)) return Alert.alert(jornada.expedienteId ? 'Informe o km final do odômetro' : 'Informe o km inicial do odômetro');
    if (jornada.expedienteId && jornada.kmInicial != null && valor < jornada.kmInicial) {
      return Alert.alert('Km final menor que o inicial', `O expediente começou com ${jornada.kmInicial} km.`);
    }
    if (!jornada.expedienteId && kmAnterior != null && valor < kmAnterior) {
      const seguir = await new Promise<boolean>((ok) => Alert.alert('Km menor que o anterior',
        `O último km registrado foi ${kmAnterior.toLocaleString('pt-BR')}. Confirma ${valor.toLocaleString('pt-BR')} km?`,
        [{ text: 'Corrigir', onPress: () => ok(false) }, { text: 'Confirmar', onPress: () => ok(true) }]));
      if (!seguir) return;
    }
    await concluirExpediente(valor);
  }

  // Abre ou fecha o expediente (km = null quando o técnico não tem veículo vinculado).
  async function concluirExpediente(valor: number | null) {
    if (!jornada) return;
    setOcupado(true);
    try {
      await registrarExpediente(valor);
    } finally {
      setOcupado(false);
    }
  }

  async function registrarExpediente(valor: number | null) {
    if (!jornada) return;
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
        Alert.alert('Localização em segundo plano', 'Para registrar o trajeto completo do dia, permita a localização "o tempo todo" nas configurações do app.',
          [{ text: 'Depois', style: 'cancel' }, { text: 'Abrir configurações', onPress: () => Linking.openSettings() }]);
      } else if (!(await AsyncStorage.getItem('aviso-bateria-visto'))) {
        AsyncStorage.setItem('aviso-bateria-visto', '1');
        Alert.alert('Não perder o trajeto', 'Para o celular não parar o GPS com o app em segundo plano, deixe o Técnico Plus sem restrição de bateria: '
          + 'na próxima tela, escolha "Todos os apps", toque em Técnico Plus e marque "Não otimizar" (ou Bateria > "Sem restrições").',
          [{ text: 'Depois', style: 'cancel' }, { text: 'Ajustar agora', onPress: abrirAjusteBateria }]);
      }
      garantirRastreio().then(setRastreio).catch(() => {});
    }
    setKm('');
    setPedindoKm(false);
  }

  async function pedirExpediente() {
    if (!jornada || ocupado) return;
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
    // Km só para quem tem veículo vinculado (do celular se o servidor demorar).
    setOcupado(true);
    const veiculo = await Promise.race([
      meuVeiculo().catch(() => meuVeiculo(false)),
      new Promise<MeuVeiculo | null>((ok) => setTimeout(() => meuVeiculo(false).then(ok), 2500)),
    ]);
    setOcupado(false);
    setPlaca(veiculo?.placa ?? null);
    if (!veiculo) {
      if (jornada.expedienteId) {
        const seguir = await new Promise<boolean>((ok) => Alert.alert('Encerrar expediente?', 'O trajeto do dia deixa de ser registrado.',
          [{ text: 'Cancelar', style: 'cancel', onPress: () => ok(false) }, { text: 'Encerrar', style: 'destructive', onPress: () => ok(true) }]));
        if (!seguir) return;
      }
      return concluirExpediente(null);
    }
    // Mostra o campo na hora; o km anterior aparece quando chegar.
    setKmAnterior(null);
    setPedindoKm(true);
    ultimoKm().then(setKmAnterior).catch(() => {});
  }

  async function alternarRefeicao() {
    if (!jornada) return;
    setJornada(jornada.inicioRefeicao ? await encerrarRefeicao(jornada) : await iniciarRefeicao(jornada));
    carregar();
  }

  const emExpediente = !!jornada?.expedienteId;
  const emRefeicao = !!jornada?.inicioRefeicao;
  const hoje = new Date(agora);
  const primeiroNome = nome.split(/\s+/)[0] ? nome.split(/\s+/)[0][0] + nome.split(/\s+/)[0].slice(1).toLowerCase() : '';
  const tempo = emExpediente && jornada?.inicioExpediente ? duracao(agora - new Date(jornada.inicioExpediente).getTime()) : null;
  const desde = emExpediente && jornada?.inicioExpediente ? hora(new Date(jornada.inicioExpediente)) : null;
  const gpsOk = rastreio ? rastreio.permissao === 'sempre' && !(rastreio.ultimoPonto && agora - rastreio.ultimoPonto > 10 * 60_000) : true;

  const sincronizando = semRede || pendentes > 0;
  const faixa = (icone: NomeIcone, texto: string, cor: string, fundo: string, aoTocar?: () => void) => (
    <Pressable style={[s.faixa, { backgroundColor: fundo }]} onPress={aoTocar} disabled={!aoTocar}>
      <Icone nome={icone} tamanho={18} cor={cor} />
      <Text style={[s.faixaTexto, { color: cor }]}>{texto}</Text>
      {aoTocar ? <Icone nome="chevron-right" tamanho={18} cor={cor} /> : null}
    </Pressable>
  );

  const grupos: { chave: Grupo; rotulo: string; cor: string; ordens: OrdemServico[] }[] = [
    { chave: 'andamento', rotulo: 'Em andamento', cor: corDoStatus.em_execucao, ordens: abertas.filter((o) => ['em_execucao', 'pausada'].includes(o.status)) },
    { chave: 'pendente', rotulo: 'Pendentes', cor: corDoStatus.enviada, ordens: abertas.filter((o) => !['em_execucao', 'pausada'].includes(o.status)) },
    { chave: 'fechada', rotulo: 'Fechadas', cor: corDoStatus.concluida, ordens: encerradas },
  ];
  const aba: Grupo = filtro ?? (grupos.find((g) => g.ordens.length > 0)?.chave ?? 'andamento');

  const topo = (
    <View>
      <Cabecalho titulo={`${saudacao(hoje)}${primeiroNome ? `, ${primeiroNome}` : ''}`}
        subtitulo={`${diaSemana(hoje)}, ${dataCurta(hoje)} · Multivale Backbone`} estendido={74}
        acoes={[
          { icone: semRede ? 'cloud-off-outline' : pendentes > 0 ? 'cloud-upload-outline' : 'cloud-check-outline', rotulo: 'Sincronização',
            selo: pendentes, cor: sincronizando ? '#F5C26B' : undefined,
            aoTocar: () => Alert.alert('Sincronização', semRede ? `Sem internet. ${pendentes} registro(s) salvos no celular.` : pendentes ? `${pendentes} registro(s) enviando.` : 'Tudo enviado.') },
          { icone: 'refresh', rotulo: 'Atualizar', aoTocar: carregar },
        ]} />

      {/* Cartão do expediente, flutuando sobre o topo */}
      <View style={s.hero}>
        <View style={s.heroLinha}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroRotulo}>EXPEDIENTE</Text>
            {emExpediente ? (
              <Text style={s.heroTempo}>{tempo}<Text style={s.heroDesde}>  · desde {desde}</Text></Text>
            ) : (
              <Text style={[s.heroTempo, { fontSize: 22 }]}>Fora do expediente</Text>
            )}
          </View>
          <View style={[s.situacao, { backgroundColor: !emExpediente ? '#F2F4F7' : emRefeicao ? '#FFF4E5' : '#E7F6EC' }]}>
            {!emExpediente ? <Icone nome="sleep" tamanho={16} cor={cores.suave} />
              : <View style={[s.pulso, { backgroundColor: emRefeicao ? cores.alerta : '#22A04B' }]} />}
            <Text style={[s.situacaoTexto, { color: !emExpediente ? cores.suave : emRefeicao ? cores.alerta : '#1E7B3A' }]}>
              {!emExpediente ? 'Off' : emRefeicao ? 'Refeição' : 'Ativo'}
            </Text>
          </View>
        </View>

        {emExpediente ? (
          <View style={s.metas}>
            {placa && jornada?.kmInicial != null ? (
              <View style={s.meta}><Icone nome="speedometer" tamanho={15} cor={cores.apagado} /><Text style={s.metaTexto}>km {jornada.kmInicial.toLocaleString('pt-BR')}</Text></View>
            ) : null}
            <View style={s.meta}>
              <Icone nome={gpsOk ? 'crosshairs-gps' : 'crosshairs-off'} tamanho={15} cor={gpsOk ? '#22A04B' : cores.perigo} />
              <Text style={[s.metaTexto, !gpsOk && { color: cores.perigo }]}>{gpsOk ? 'GPS ativo' : 'GPS parado'}</Text>
            </View>
            {placa ? <View style={s.meta}><Icone nome="car-outline" tamanho={15} cor={cores.apagado} /><Text style={s.metaTexto}>{placa}</Text></View> : null}
          </View>
        ) : (
          <Text style={s.heroAjuda}>Inicie o expediente para receber e executar atividades.</Text>
        )}

        {pedindoKm ? (
          <View style={{ marginTop: 14 }}>
            <TextInput style={s.campo} keyboardType="numeric" value={km} onChangeText={setKm} autoFocus placeholderTextColor={cores.apagado}
              placeholder={emExpediente ? 'Km final do odômetro' : 'Km inicial do odômetro'} />
            {!emExpediente && kmAnterior != null ? (
              <Text style={[s.heroAjuda, { marginTop: 6 }]}>Km anterior: {kmAnterior.toLocaleString('pt-BR')} (último registrado)</Text>
            ) : null}
            <View style={s.botoes}>
              <Pressable style={[s.botao, s.botaoSecundario]} onPress={() => { setPedindoKm(false); setKm(''); }}>
                <Text style={[s.botaoTexto, { color: cores.texto }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[s.botao, { backgroundColor: emExpediente ? cores.perigo : cores.sucesso }]} onPress={confirmarKm} disabled={ocupado}>
                {ocupado ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Icone nome={emExpediente ? 'stop-circle-outline' : 'play-circle-outline'} tamanho={20} cor="#fff" />
                    <Text style={s.botaoTexto}>{emExpediente ? 'Encerrar' : 'Iniciar'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : !emExpediente ? (
          <View style={s.botoes}>
            <Pressable style={[s.botao, { backgroundColor: cores.sucesso }]} onPress={pedirExpediente} disabled={ocupado}>
              {ocupado ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Icone nome="play-circle-outline" tamanho={20} cor="#fff" />
                  <Text style={s.botaoTexto}>Iniciar expediente</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : emRefeicao ? (
          <View style={s.botoes}>
            <Pressable style={[s.botao, { backgroundColor: cores.alerta }]} onPress={alternarRefeicao}>
              <Icone nome="play-circle-outline" tamanho={20} cor="#fff" />
              <Text style={s.botaoTexto}>Encerrar refeição</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.botoes}>
            <Pressable style={[s.botao, { backgroundColor: cores.primaria }]} onPress={iniciarAtividade}>
              <Icone nome="plus" tamanho={20} cor="#fff" />
              <Text style={s.botaoTexto}>Nova atividade</Text>
            </Pressable>
            {!jornada?.refeicaoFeita ? (
              <Pressable style={[s.quadrado, { backgroundColor: '#FFF4E5' }]} onPress={alternarRefeicao} accessibilityLabel="Iniciar refeição">
                <Icone nome="silverware-fork-knife" tamanho={21} cor={cores.alerta} />
              </Pressable>
            ) : null}
            <Pressable style={[s.quadrado, { backgroundColor: '#FDECEC' }]} onPress={pedirExpediente} disabled={ocupado} accessibilityLabel="Encerrar expediente">
              {ocupado ? <ActivityIndicator color={cores.perigo} /> : <Icone nome="power" tamanho={21} cor={cores.perigo} />}
            </Pressable>
          </View>
        )}
      </View>

      {novaVersao ? faixa('download', `Nova versão do app (${novaVersao}). Toque para atualizar.`, '#fff', cores.primaria, () => Linking.openURL(LINK_APK)) : null}
      {emExpediente && rastreio && rastreio.permissao !== 'sempre'
        ? faixa('map-marker-off-outline', 'Trajeto só é gravado com o app aberto. Toque, vá em Localização e escolha "Permitir o tempo todo".',
          cores.perigo, '#FDECEC', () => Linking.openSettings())
        : emExpediente && rastreio?.ultimoPonto && agora - rastreio.ultimoPonto > 10 * 60_000
          ? faixa('map-marker-alert-outline', `O celular parou o GPS por ${Math.round((agora - rastreio.ultimoPonto) / 60000)} min. Toque e tire o Técnico Plus da economia de bateria.`,
            cores.perigo, '#FDECEC', abrirAjusteBateria)
          : null}
      {inventarioFaltam > 0
        ? faixa('toolbox-outline', `Inventário Matinal: ${inventarioFaltam} item(ns) para fotografar. Toque para fazer.`, '#5B3A86', '#F3EEFA', abrirInventario)
        : null}
      {semRede ? faixa('wifi-off', 'Sem internet. Tudo que você registrar fica salvo no celular.', '#7A4B00', '#FFF4E5') : null}

      <View style={s.segmento}>
        {grupos.map((g) => {
          const ativo = g.chave === aba;
          return (
            <Pressable key={g.chave} style={[s.segItem, ativo && s.segAtivo]} onPress={() => setFiltro(g.chave)}>
              <Text style={[s.segTexto, ativo && { color: cores.texto }]} numberOfLines={1}>
                {g.rotulo} <Text style={{ color: ativo ? g.cor : cores.apagado }}>{g.ordens.length}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: cores.fundo }}
      data={grupos.find((g) => g.chave === aba)?.ordens ?? []}
      keyExtractor={(os) => os.id}
      ListHeaderComponent={topo}
      ListEmptyComponent={<Text style={s.vazio}>{aba === 'andamento' ? 'Nenhuma atividade em andamento.' : aba === 'pendente' ? 'Nenhuma atividade pendente.' : 'Nenhuma atividade fechada nos últimos 7 dias.'}</Text>}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      renderItem={({ item }) => <Cartao os={item} abrir={abrirOS} />}
      contentContainerStyle={{ paddingBottom: 24 }}
      initialNumToRender={10}
      windowSize={7}
    />
  );
}

const Cartao = memo(function Cartao({ os, abrir }: { os: OrdemServico; abrir: (os: OrdemServico) => void }) {
  const emAberto = !ENCERRADAS.includes(os.status);
  const sla = os.sla_limite && emAberto ? textoSla(os.sla_limite) : null;
  const corSla = !sla ? cores.apagado : sla.nivel === 'ok' ? cores.sucesso : sla.nivel === 'alerta' ? cores.alerta : cores.perigo;
  const cor = corDoStatus[os.status] ?? cores.suave;
  const urgente = os.prioridade === 'emergencia' || os.prioridade === 'alta';
  return (
    <Pressable style={({ pressed }) => [s.cartao, pressed && { opacity: 0.85 }]} onPress={() => abrir(os)}>
      <View style={s.cartaoTopo}>
        <View style={[s.cartaoIcone, { backgroundColor: cor }]}>
          <Icone nome={iconeDoTipo(os.tipo)} tamanho={19} cor="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {urgente ? <Icone nome="alert" tamanho={15} cor={cores.perigo} /> : null}
            <Text style={s.cartaoTitulo} numberOfLines={1}>{os.titulo}</Text>
          </View>
          <Text style={s.cartaoSub} numberOfLines={1}>
            {os.tipo}{os.numero ? ` · #${os.numero}` : ''}{os.ticket_acionamento ? ` · ${os.ticket_acionamento}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          {sla ? (
            <>
              <Text style={[s.cartaoHora, { color: corSla }]}>
                {sla.nivel === 'vencido' ? 'Vencido' : new Date(os.sla_limite!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={s.cartaoHoraRotulo}>{sla.nivel === 'vencido' ? 'SLA' : 'LIMITE'}</Text>
            </>
          ) : <Text style={[s.cartaoHora, { color: cores.apagado }]}>—</Text>}
        </View>
      </View>
      <View style={s.cartaoDivisor} />
      <View style={s.cartaoBase}>
        <Icone nome="map-marker-outline" tamanho={14} cor={cores.apagado} />
        <Text style={s.cartaoEndereco} numberOfLines={1}>{os.endereco || 'Sem endereço'}</Text>
        <View style={[s.selo, { backgroundColor: fundoDe(cor) }]}>
          <Text style={[s.seloTexto, { color: cor }]}>{rotuloDaOs(os)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  hero: { backgroundColor: cores.cartao, marginHorizontal: 16, marginTop: -74, borderRadius: 22, padding: 16,
    shadowColor: '#0F2747', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  heroLinha: { flexDirection: 'row', alignItems: 'flex-start' },
  heroRotulo: { fontSize: 11.5, fontWeight: '700', color: cores.suave, letterSpacing: 0.6 },
  heroTempo: { fontSize: 28, fontWeight: '800', color: cores.texto, letterSpacing: -0.6, marginTop: 2 },
  heroDesde: { fontSize: 14, fontWeight: '500', color: cores.suave, letterSpacing: 0 },
  heroAjuda: { fontSize: 13, color: cores.suave, marginTop: 6 },
  situacao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  situacaoTexto: { fontSize: 12.5, fontWeight: '700' },
  pulso: { width: 8, height: 8, borderRadius: 4 },
  metas: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTexto: { fontSize: 12.5, color: cores.texto2 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: '#F9FAFB', color: cores.texto },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botao: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 14, height: 50 },
  quadrado: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14 },
  faixaTexto: { flex: 1, fontSize: 13, fontWeight: '500' },
  segmento: { flexDirection: 'row', backgroundColor: '#E2E7EE', borderRadius: 14, padding: 4, marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segAtivo: { backgroundColor: cores.cartao, ...sombra },
  segTexto: { fontSize: 13, fontWeight: '700', color: '#5A6576' },
  vazio: { color: cores.suave, margin: 24, textAlign: 'center' },
  cartao: { backgroundColor: cores.cartao, borderRadius: 18, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, ...sombra },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartaoIcone: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cartaoTitulo: { flex: 1, fontSize: 15.5, fontWeight: '700', color: cores.texto },
  cartaoSub: { fontSize: 12.5, color: cores.suave, marginTop: 2 },
  cartaoHora: { fontSize: 15, fontWeight: '800' },
  cartaoHoraRotulo: { fontSize: 10, color: cores.apagado, letterSpacing: 0.5, marginTop: 1 },
  cartaoDivisor: { height: 1, backgroundColor: cores.linha, marginTop: 12, marginBottom: 10 },
  cartaoBase: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cartaoEndereco: { flex: 1, fontSize: 12.5, color: cores.suave, marginRight: 8 },
  selo: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  seloTexto: { fontSize: 11.5, fontWeight: '700' },
});
