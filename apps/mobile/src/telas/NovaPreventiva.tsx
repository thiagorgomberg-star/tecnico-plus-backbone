import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { cores, estilo } from '../lib/estilo';
import { enfileirar } from '../lib/fila';
import { lerJornada } from '../lib/jornada';
import { enderecoDe, posicaoAtual } from '../lib/localizacao';
import { compartilharOsApresentacao } from '../lib/osApresentacao';
import { ponto, supabase } from '../lib/supabase';
import { OrdemServico } from '../lib/tipos';
import { ehVistoria, TRECHOS_VISTORIA, VISTORIA_MG, VISTORIA_SP } from '../lib/vistoria';

type Rota = { id: string; trecho: string; regiao?: string | null };
const TIPOS = ['Preventiva rede', 'Preventiva site', VISTORIA_MG, VISTORIA_SP];
const CACHE_ROTAS = 'rotas-cache';
const CACHE_ATIVIDADES = 'atividades-preventiva-cache';

type Atividade = { id: string; tipo: string; nome: string };

type Captura = { latitude: number; longitude: number; precisao: number | null; em: string };

// O técnico abre e já inicia uma preventiva em campo (funciona sem internet).
export default function NovaPreventiva({ voltar, abrirOS }: { voltar: () => void; abrirOS: (os: OrdemServico) => void }) {
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [rotaId, setRotaId] = useState<string | null>(null);
  const [local, setLocal] = useState('');
  const [endereco, setEndereco] = useState('');
  const [atividades, setAtividades] = useState('');
  const [lista, setLista] = useState<Atividade[]>([]);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [ticket, setTicket] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [capturando, setCapturando] = useState(false);
  // Endereço que o GPS preencheu; se o técnico editar o campo, uma nova captura não sobrescreve.
  const enderecoAuto = useRef('');

  useEffect(() => {
    AsyncStorage.getItem(CACHE_ROTAS).then((c) => c && setRotas(JSON.parse(c)));
    supabase.from('rotas').select('id, trecho, descricao, link_kmz, regiao').eq('ativo', true).order('trecho').then(({ data }) => {
      if (!data) return;
      setRotas(data);
      AsyncStorage.setItem(CACHE_ROTAS, JSON.stringify(data));
    });
    AsyncStorage.getItem(CACHE_ATIVIDADES).then((c) => c && setLista(JSON.parse(c)));
    supabase.from('atividades_preventiva').select('id, tipo, nome').eq('ativo', true).order('ordem').order('nome').then(({ data }) => {
      if (!data) return;
      setLista(data);
      AsyncStorage.setItem(CACHE_ATIVIDADES, JSON.stringify(data));
    });
  }, []);

  const doTipo = lista.filter((a) => a.tipo === tipo);
  const vistoriaMg = ehVistoria(tipo);
  const vistoria = TRECHOS_VISTORIA[tipo];
  // Trechos cadastrados pelo supervisor (painel > Rotas e eventos), os da região da vistoria primeiro.
  // Sem nenhum cadastrado ainda, usa a lista padrão.
  const siglaRegiao = tipo === VISTORIA_SP ? 'SP' : 'MG';
  const trechosVistoria: { id: string | null; trecho: string; regiao: string | null }[] = rotas.length
    ? [...rotas].sort((a, b) => Number((b.regiao ?? 'MG') === siglaRegiao) - Number((a.regiao ?? 'MG') === siglaRegiao)
      || (a.regiao ?? '').localeCompare(b.regiao ?? '') || a.trecho.localeCompare(b.trecho))
      .map((r) => ({ id: r.id, trecho: r.trecho, regiao: r.regiao ?? null }))
    : (vistoria?.trechos ?? []).map((t) => ({ id: null, trecho: t, regiao: siglaRegiao }));
  const marcar = (nome: string) => setMarcadas((m) => (m.includes(nome) ? m.filter((x) => x !== nome) : [...m, nome]));

  // Captura a posição (funciona sem internet) e preenche o endereço (com internet; offline, as coordenadas).
  async function capturar() {
    setCapturando(true);
    const pos = await posicaoAtual().catch(() => null);
    if (!pos) {
      setCapturando(false);
      return Alert.alert('Localização indisponível', 'Permita o acesso à localização e confira se o GPS está ligado.');
    }
    const nova = { latitude: pos.latitude, longitude: pos.longitude, precisao: pos.accuracy, em: new Date().toISOString() };
    setCaptura(nova);
    const texto = (await enderecoDe(pos.latitude, pos.longitude, 5000)) ??
      `Coordenadas ${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}`;
    setEndereco((atual) => {
      if (atual.trim() && atual !== enderecoAuto.current) return atual;
      enderecoAuto.current = texto;
      return texto;
    });
    setCapturando(false);
  }

  useEffect(() => {
    capturar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciar() {
    if (!vistoriaMg && rotas.length > 0 && !rotaId) return Alert.alert('Escolha o trecho', 'Informe em qual trecho do backbone é a preventiva.');
    if (!local.trim()) return Alert.alert(vistoriaMg ? 'Escolha o trecho' : 'Informe o local', vistoriaMg ? 'Toque no trecho que será vistoriado.' : tipo === 'Preventiva site' ? 'Nome do site/POP.' : 'Ponto ou trecho atendido.');
    if (!endereco.trim()) return Alert.alert('Informe o endereço ou referência', 'Ex.: km, cidade, rodovia.');
    const escolhidas = doTipo.filter((a) => marcadas.includes(a.nome)).map((a) => `• ${a.nome}`);
    const descricao = [...escolhidas, atividades.trim()].filter(Boolean).join('\n');
    if (!descricao) return Alert.alert('Informe as atividades', 'Marque o que será executado ou descreva em "Outras atividades".');

    const jornada = await lerJornada();
    if (!jornada.expedienteId) return Alert.alert('Expediente não iniciado', 'Inicie o expediente antes de abrir uma preventiva.');

    setSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao.session?.user.id;
    if (!usuario) {
      setSalvando(false);
      return Alert.alert('Sessão expirada', 'Entre de novo no app.');
    }
    const coords = captura ?? (await posicaoAtual().catch(() => null));
    const posicao = coords ? ponto(coords.latitude, coords.longitude) : null;
    const id = randomUUID();
    const agora = new Date().toISOString();
    const linha = {
      id,
      tipo,
      status: 'em_execucao',
      prioridade: 'media',
      titulo: local.trim(),
      endereco: endereco.trim(),
      descricao,
      ticket_acionamento: ticket.trim() || null,
      observacao_tecnico: observacao.trim() || null,
      rota_id: rotaId,
      tecnico_id: usuario,
      criada_por: usuario,
      iniciada_em: agora,
      local: posicao,
      evento_posicao: posicao,
      evento_localizado_em: captura?.em ?? (coords ? agora : null),
      evento_precisao_m: captura?.precisao ?? (coords && 'accuracy' in coords ? coords.accuracy : null),
    };
    await enfileirar({ tipo: 'inserir', tabela: 'ordens_servico', linha });
    setSalvando(false);

    abrirOS({
      id, numero: 0, tipo, prioridade: 'media', status: 'em_execucao',
      titulo: linha.titulo, descricao: linha.descricao, endereco: linha.endereco, prazo: null,
      observacao_tecnico: linha.observacao_tecnico, observacao_supervisor: null, evento_localizado_em: linha.evento_localizado_em,
      ticket_acionamento: linha.ticket_acionamento, sla_limite: null,
    });
    Alert.alert('Atividade iniciada', 'Quer gerar a O.S. de apresentação (para mostrar em caso de abordagem policial)?', [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Gerar O.S.', onPress: () => compartilharOsApresentacao({ id, numero: 0, tipo, titulo: linha.titulo, endereco: linha.endereco, ticket_acionamento: linha.ticket_acionamento })
        .catch((e) => Alert.alert('Não foi possível gerar', String(e))) },
    ]);
  }

  const chip = (ativo: boolean) => [s.chip, ativo && { backgroundColor: cores.primaria, borderColor: cores.primaria }];

  return (
    <ScrollView style={estilo.tela} keyboardShouldPersistTaps="handled">
      <Cabecalho titulo="Iniciar atividade" voltar={voltar} />
      <Text style={[estilo.suave, { marginHorizontal: 16, marginTop: 12 }]}>
        A preventiva já começa em execução, com a sua localização. Depois é igual a uma O.S.: fotos (mínimo 10) e conclusão.
      </Text>

      <View style={estilo.cartao}>
        <Text style={s.rotulo}>Tipo</Text>
        <View style={s.chips}>
          {TIPOS.map((t) => (
            <Pressable key={t} style={[...chip(tipo === t), s.tipo]} onPress={() => { if (ehVistoria(t) || vistoriaMg) setLocal(''); setTipo(t); setMarcadas([]); }}>
              <Text style={[s.chipTexto, { textAlign: 'center' }, tipo === t && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {vistoriaMg ? (
          <>
            <Text style={s.rotulo}>Trecho *</Text>
            <View style={s.chips}>
              {trechosVistoria.map((t) => (
                <Pressable key={t.id ?? t.trecho} style={chip(local === t.trecho)} onPress={() => { setLocal(t.trecho); setRotaId(t.id); }}>
                  <Text style={[s.chipTexto, local === t.trecho && { color: '#fff' }]}>
                    {t.regiao && t.regiao !== siglaRegiao ? `${t.regiao} · ` : ''}{t.trecho}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[estilo.suave, { marginTop: 8 }]}>
              Depois de iniciar, lance poste a poste e as ocorrências na aba Postes. As caixas vão na aba Caixas.
            </Text>
          </>
        ) : null}

        {!vistoriaMg && rotas.length > 0 && (
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

        <Text style={s.rotulo}>{vistoriaMg ? 'Trecho (pode ajustar)' : tipo === 'Preventiva site' ? 'Site / POP *' : 'Local / ponto atendido *'}</Text>
        <TextInput placeholderTextColor={cores.apagado} style={estilo.campo} value={local} onChangeText={setLocal}
          placeholder={tipo === 'Preventiva site' ? 'Ex.: POP Taubaté' : 'Ex.: Caixa de emenda km 112'} />

        <Text style={s.rotulo}>Localização</Text>
        <View style={s.local}>
          <Text style={{ flex: 1, color: captura ? cores.texto : cores.suave }}>
            {capturando ? 'Capturando...' : captura
              ? `${captura.latitude.toFixed(6)}, ${captura.longitude.toFixed(6)}${captura.precisao != null ? ` · ±${Math.round(captura.precisao)} m` : ''}`
              : 'Ainda não capturada'}
          </Text>
          <Pressable style={s.botaoLocal} onPress={capturar} disabled={capturando}>
            {capturando ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '700' }}>{captura ? 'Capturar de novo' : 'Capturar localização'}</Text>}
          </Pressable>
        </View>

        <Text style={s.rotulo}>Endereço ou referência *</Text>
        <TextInput placeholderTextColor={cores.apagado} style={estilo.campo} value={endereco} onChangeText={setEndereco} placeholder="Preenchido pelo GPS; pode ajustar" multiline />

        <Text style={s.rotulo}>Atividades a executar *</Text>
        {doTipo.map((a) => {
          const ok = marcadas.includes(a.nome);
          return (
            <Pressable key={a.id} style={s.item} onPress={() => marcar(a.nome)}>
              <View style={[s.caixa, ok && { backgroundColor: cores.primaria, borderColor: cores.primaria }]}>
                {ok ? <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text> : null}
              </View>
              <Text style={{ flex: 1, color: cores.texto, fontSize: 15 }}>{a.nome}</Text>
            </Pressable>
          );
        })}
        <TextInput placeholderTextColor={cores.apagado} style={[estilo.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={atividades} onChangeText={setAtividades}
          multiline placeholder={doTipo.length ? 'Outras atividades (opcional)' : 'O que será verificado, limpo, medido ou trocado'} />

        <Text style={s.rotulo}>Ticket (opcional)</Text>
        <TextInput placeholderTextColor={cores.apagado} style={estilo.campo} value={ticket} onChangeText={setTicket} autoCapitalize="characters"
          placeholder="Em branco: o sistema gera um token" />

        <Text style={s.rotulo}>Observações</Text>
        <TextInput style={[estilo.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={observacao} onChangeText={setObservacao} multiline />

        <Pressable style={[estilo.botao, { backgroundColor: cores.sucesso }]} onPress={iniciar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={estilo.botaoTexto}>{vistoriaMg ? 'Iniciar vistoria' : 'Iniciar preventiva'}</Text>}
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
  tipo: { width: '48.5%', alignItems: 'center', borderRadius: 12, paddingVertical: 10 },
  chipTexto: { color: cores.texto, fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  caixa: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: cores.borda, alignItems: 'center', justifyContent: 'center' },
  local: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  botaoLocal: { backgroundColor: cores.primaria, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minWidth: 120, alignItems: 'center' },
});
