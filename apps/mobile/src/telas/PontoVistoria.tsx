import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { cores } from '../lib/estilo';
import { aoMudarFila, itensPendentes } from '../lib/fila';
import { enderecoDe, posicaoAtual } from '../lib/localizacao';
import { navegarAte } from '../lib/navegacao';
import { supabase } from '../lib/supabase';
import {
  ESTADOS_BASE, excluirPonto, GRAVIDADES, LICENCIAMENTOS, MATERIAIS, OCORRENCIAS, Opcao, PontoVistoria as Ponto, proximoPoste, salvarPonto, TIPOS_VIA,
} from '../lib/vistoria';
import CameraOS from './CameraOS';

type Props = {
  osId: string;
  tipoOs: string;
  ponto: Ponto | null;       // null: ponto novo
  categoria: 'poste' | 'ocorrencia'; // usado quando é novo
  daOs: Ponto[];             // já lançados (número do próximo poste e via do anterior)
  podeEditar: boolean;
  usuario: { nome: string; cargo: string | null };
  voltar: () => void;
};

function novoPonto(osId: string, categoria: 'poste' | 'ocorrencia', daOs: Ponto[]): Ponto {
  // Herda do último ponto o que costuma se repetir ao longo da rota (via e material do poste).
  const anterior = [...daOs].reverse().find((p) => p.categoria === 'poste') ?? daOs[daOs.length - 1];
  return {
    id: randomUUID(), os_id: osId, categoria,
    identificacao: categoria === 'poste' ? proximoPoste(daOs) : null,
    latitude: null, longitude: null, precisao_m: null, localizada_em: null, endereco: null,
    material: categoria === 'poste' ? anterior?.material ?? 'madeira' : null,
    estado_base: categoria === 'poste' ? 'ok' : null, inclinado: false, rachado: false,
    estai: null, precisa_troca: false,
    tipo_via: anterior?.tipo_via ?? null, licenciamento: anterior?.licenciamento ?? null, via_nome: anterior?.via_nome ?? null,
    ocorrencia: null, gravidade: categoria === 'ocorrencia' ? 'media' : null, observacao: null, gerar_os: false,
  };
}

// Registro de um poste ou de uma ocorrência na Vistoria Backbone (MG/SP): GPS, situação, via e fotos (funciona offline).
export default function PontoVistoria({ osId, tipoOs, ponto: inicial, categoria, daOs, podeEditar, usuario, voltar }: Props) {
  const [nova, setNova] = useState(!inicial);
  const [p, setP] = useState<Ponto>(() => inicial ?? novoPonto(osId, categoria, daOs));
  const [lancados, setLancados] = useState(daOs);
  const [capturando, setCapturando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [camera, setCamera] = useState(false);
  const [fotos, setFotos] = useState(0);
  // Depois de salvo com "gerar O.S.", a O.S. já existe (ou vai existir quando sincronizar): não dá para desmarcar.
  const [osJaGerada, setOsJaGerada] = useState(!!inicial?.gerar_os);
  const enderecoAuto = useRef('');
  const poste = p.categoria === 'poste';
  const mudar = (campos: Partial<Ponto>) => setP((x) => ({ ...x, ...campos }));

  useEffect(() => {
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      voltar();
      return true;
    });
    return () => assinatura.remove();
  }, [voltar]);

  // Fotos deste ponto (enviadas + na fila).
  useEffect(() => {
    const contar = async () => {
      const naFila = (await itensPendentes()).filter((i) => i.tipo === 'foto' && i.pontoId === p.id).length;
      const { count } = await supabase.from('os_anexos').select('id', { count: 'exact', head: true }).eq('ponto_id', p.id);
      setFotos(naFila + (count ?? 0));
    };
    contar();
    return aoMudarFila(contar);
  }, [p.id]);

  useEffect(() => {
    if (nova) capturar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  async function capturar() {
    setCapturando(true);
    const pos = await posicaoAtual().catch(() => null);
    if (!pos) {
      setCapturando(false);
      return Alert.alert('Localização indisponível', 'Permita o acesso à localização e confira se o GPS está ligado.');
    }
    mudar({ latitude: pos.latitude, longitude: pos.longitude, precisao_m: pos.accuracy, localizada_em: new Date().toISOString() });
    const texto = (await enderecoDe(pos.latitude, pos.longitude, 5000)) ?? `Coordenadas ${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}`;
    setP((x) => {
      if (x.endereco?.trim() && x.endereco !== enderecoAuto.current) return x;
      enderecoAuto.current = texto;
      return { ...x, endereco: texto };
    });
    setCapturando(false);
  }

  function validar() {
    if (p.latitude == null) {
      Alert.alert('Sem localização', 'Capture a localização do ponto antes de salvar.');
      return false;
    }
    if (!poste && !p.ocorrencia) {
      Alert.alert('Tipo de ocorrência', 'Escolha o que foi encontrado.');
      return false;
    }
    if (!p.tipo_via) {
      Alert.alert('Tipo de via', 'Informe onde o ponto está (rodovia, vicinal, urbana...). Isso define o licenciamento.');
      return false;
    }
    if (!p.licenciamento) {
      Alert.alert('Licenciamento', 'Informe se o trecho é licenciado ou sem licenciamento.');
      return false;
    }
    return true;
  }

  async function salvar(seguir: boolean) {
    if (!validar()) return;
    setSalvando(true);
    await salvarPonto(p, nova);
    setSalvando(false);
    const todos = [...lancados.filter((x) => x.id !== p.id), p];
    setLancados(todos);
    if (seguir) {
      // Próximo poste já com o número seguinte, a mesma via e o mesmo material.
      enderecoAuto.current = '';
      setNova(true);
      setOsJaGerada(false);
      setFotos(0);
      setP(novoPonto(osId, 'poste', todos));
      return;
    }
    setNova(false);
    if (p.gerar_os) setOsJaGerada(true);
    if (fotos === 0) {
      Alert.alert('Ponto salvo', p.gerar_os
        ? 'A O.S. de correção vai para o backlog. Tire as fotos agora: elas servem de guia para quem for corrigir.'
        : 'Quer tirar a foto agora?', [
        { text: 'Depois', style: 'cancel' },
        { text: 'Tirar foto', onPress: () => setCamera(true) },
      ]);
    }
  }

  function excluir() {
    Alert.alert('Excluir ponto', `Excluir ${p.identificacao || 'este ponto'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await excluirPonto(p); voltar(); } },
    ]);
  }

  const chips = (lista: Opcao[], valor: string | null, aoEscolher: (v: string) => void) => (
    <View style={s.chips}>
      {lista.map((o) => (
        <Pressable key={o.valor} style={[s.chip, valor === o.valor && s.chipAtivo]} disabled={!podeEditar} onPress={() => aoEscolher(o.valor)}>
          <Text style={[s.chipTexto, valor === o.valor && { color: '#fff' }]}>{o.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );
  const chave = (rotulo: string, valor: boolean | null, aoMudar: (v: boolean) => void, perigo = false) => (
    <View style={s.linha}>
      <Text style={[s.texto, { flex: 1 }, perigo && valor ? { color: cores.perigo, fontWeight: '700' } : null]}>{rotulo}</Text>
      <Switch value={!!valor} onValueChange={aoMudar} disabled={!podeEditar} />
    </View>
  );

  const titulo = poste ? `Poste ${p.identificacao ?? ''}`.trim() : 'Ocorrência';

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo={nova ? `Novo ${poste ? 'poste' : 'registro de ocorrência'}` : titulo} subtitulo={tipoOs} voltar={voltar}
        acoes={!nova && podeEditar ? [{ icone: 'delete-outline', rotulo: 'Excluir', aoTocar: excluir }] : undefined} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.bloco}>
          {poste ? (
            <>
              <Text style={s.rotulo}>NÚMERO / PLAQUETA</Text>
              <TextInput style={s.campo} value={p.identificacao ?? ''} editable={podeEditar} autoCapitalize="characters"
                onChangeText={(t) => mudar({ identificacao: t })} />
            </>
          ) : (
            <>
              <Text style={s.rotulo}>O QUE FOI ENCONTRADO *</Text>
              {chips(OCORRENCIAS, p.ocorrencia, (v) => mudar({ ocorrencia: v }))}
              <Text style={s.rotulo}>GRAVIDADE</Text>
              {chips(GRAVIDADES, p.gravidade, (v) => mudar({ gravidade: v }))}
            </>
          )}

          <Text style={s.rotulo}>LOCALIZAÇÃO *</Text>
          <View style={s.local}>
            <Text style={{ flex: 1, color: p.latitude != null ? cores.texto : cores.perigo }}>
              {capturando ? 'Capturando...' : p.latitude != null
                ? `${p.latitude.toFixed(6)}, ${p.longitude!.toFixed(6)}${p.precisao_m != null ? ` · ±${Math.round(p.precisao_m)} m` : ''}`
                : 'Ainda não capturada'}
            </Text>
            {podeEditar ? (
              <Pressable style={s.botaoPequeno} onPress={capturar} disabled={capturando}>
                {capturando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.botaoPequenoTexto}>{p.latitude != null ? 'Capturar de novo' : 'Capturar'}</Text>}
              </Pressable>
            ) : null}
          </View>
          {p.latitude != null ? (
            <View style={s.navegar}>
              <Pressable style={[s.botaoNav, { backgroundColor: '#E8F0FE' }]} onPress={() => navegarAte({ lat: p.latitude, lng: p.longitude })}>
                <Text style={[s.botaoNavTexto, { color: cores.primaria }]}>Navegar até o ponto (Waze / Google Maps)</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput style={s.campo} value={p.endereco ?? ''} editable={podeEditar} multiline placeholder="Endereço / referência"
            onChangeText={(t) => mudar({ endereco: t })} />
        </View>

        {poste ? (
          <View style={s.bloco}>
            <Text style={s.rotulo}>MATERIAL</Text>
            {chips(MATERIAIS, p.material, (v) => mudar({ material: v }))}
            <Text style={s.rotulo}>BASE DO POSTE (NA LINHA DO SOLO)</Text>
            {chips(ESTADOS_BASE, p.estado_base, (v) => mudar({ estado_base: v, precisa_troca: v !== 'ok' ? true : p.precisa_troca }))}
            {chave('Inclinado', p.inclinado, (v) => mudar({ inclinado: v }))}
            {chave('Rachado', p.rachado, (v) => mudar({ rachado: v }))}
            {chave('Precisa trocar o poste', p.precisa_troca, (v) => mudar({ precisa_troca: v }), true)}
            {p.material === 'madeira' && p.estado_base && p.estado_base !== 'ok' ? (
              <Text style={[s.suave, { color: cores.perigo }]}>Base comprometida: não subir neste poste. Use escada apoiada ou aguarde a troca.</Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.bloco}>
          <Text style={s.rotulo}>ONDE ESTÁ (DEFINE O LICENCIAMENTO) *</Text>
          {chips(TIPOS_VIA, p.tipo_via, (v) => mudar({ tipo_via: v }))}
          <Text style={s.rotulo}>LICENCIAMENTO DO TRECHO *</Text>
          {chips(LICENCIAMENTOS, p.licenciamento, (v) => mudar({ licenciamento: v }))}
          <TextInput style={s.campo} value={p.via_nome ?? ''} editable={podeEditar} placeholder="Via / km (ex.: BR-381 km 812, SP-123, Dutra km 140)"
            onChangeText={(t) => mudar({ via_nome: t })} />
          <View style={[s.linha, { borderBottomWidth: 0, marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.texto, { fontWeight: '700' }]}>Gerar O.S. de correção</Text>
              <Text style={s.suave}>
                {osJaGerada
                  ? p.os_gerada_numero ? `O.S. #${p.os_gerada_numero} gerada no backlog.` : 'O.S. gerada (vai para o backlog ao sincronizar).'
                  : 'Não corrigir agora: anota e cria uma Preventiva rede no backlog, com as fotos deste ponto como guia.'}
              </Text>
            </View>
            <Switch value={!!p.gerar_os} onValueChange={(v) => mudar({ gerar_os: v })} disabled={!podeEditar || osJaGerada} />
          </View>
          <Text style={s.rotulo}>OBSERVAÇÃO {p.gerar_os ? '(O QUE PRECISA SER CORRIGIDO)' : ''}</Text>
          <TextInput style={[s.campo, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={p.observacao ?? ''} editable={podeEditar}
            onChangeText={(t) => mudar({ observacao: t })} />
          {!nova ? (
            <Pressable style={[s.botao, { backgroundColor: cores.primaria }]} onPress={() => setCamera(true)} disabled={!podeEditar}>
              <Text style={s.botaoTexto}>Fotos do {poste ? 'poste' : 'ponto'} ({fotos})</Text>
            </Pressable>
          ) : (
            <Text style={s.suave}>Depois de salvar, tire a foto do {poste ? 'poste (base e topo)' : 'ponto'}.</Text>
          )}
        </View>
      </ScrollView>

      <Modal visible={camera} onRequestClose={() => setCamera(false)} animationType="fade" supportedOrientations={['landscape', 'portrait']}>
        {camera ? (
          <CameraOS osId={osId} fotosJaFeitas={fotos} minimo={1} usuario={usuario}
            ponto={{ id: p.id, titulo: `${titulo}${p.via_nome ? ` · ${p.via_nome}` : ''}` }} fechar={() => setCamera(false)} />
        ) : null}
      </Modal>

      {podeEditar ? (
        <View style={s.rodape}>
          {poste ? (
            <Pressable style={[s.botao, { backgroundColor: cores.primaria, marginTop: 0, flex: 1 }]} onPress={() => salvar(true)} disabled={salvando}>
              <Text style={s.botaoTexto}>Salvar e próximo</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.botao, { backgroundColor: cores.sucesso, marginTop: 0, flex: 1 }]} onPress={() => salvar(false)} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>Salvar</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginTop: 10, marginBottom: 2 },
  texto: { fontSize: 15, color: cores.texto },
  suave: { fontSize: 13, color: cores.suave, marginTop: 6 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 15, backgroundColor: '#fff', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#fff' },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.texto, fontSize: 14 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  local: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  botaoPequeno: { backgroundColor: cores.primaria, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', minWidth: 110 },
  botaoPequenoTexto: { color: '#fff', fontWeight: '700' },
  botao: { borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  navegar: { marginTop: 8 },
  botaoNav: { borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  botaoNavTexto: { fontWeight: '700', fontSize: 14 },
  rodape: { flexDirection: 'row', gap: 10, backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda, padding: 12 },
});
