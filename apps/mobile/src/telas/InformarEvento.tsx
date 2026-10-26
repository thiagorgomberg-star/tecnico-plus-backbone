import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import RolarComTeclado from '../componentes/RolarComTeclado';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, sombra } from '../lib/estilo';
import { ocorrenciasProximas, Proxima } from '../lib/backlog';
import { aoMudarFila, enfileirar, itensPendentes } from '../lib/fila';
import { idadeOs } from '../lib/formato';
import { enderecoDe, posicaoAtual } from '../lib/localizacao';
import { navegarAte } from '../lib/navegacao';
import CameraOS from './CameraOS';

// Ocorrência vista em campo (cabo rompido, poste caído...): vira uma O.S. no backlog que qualquer técnico pode assumir.
// Funciona sem internet: o registro e as fotos entram na fila e sobem quando houver sinal.
const CATEGORIAS = [
  'Cabo rompido', 'Cabo baixo / flecha', 'Cabo exposto', 'Poste danificado', 'Caixa de emenda danificada',
  'Vegetação sobre a rede', 'Vandalismo / furto', 'Obra de terceiros', 'Outro',
];
const GRAVIDADES = [{ valor: 'baixa', rotulo: 'Baixa' }, { valor: 'media', rotulo: 'Média' }, { valor: 'alta', rotulo: 'Alta' }];
const MINIMO_FOTOS = 3;

type Local = { lat: number; lng: number; precisao: number | null; quando: string };

export default function InformarEvento({ usuario, voltar }: { usuario: { nome: string; cargo: string | null }; voltar: () => void }) {
  const [id] = useState(() => randomUUID());
  const [categoria, setCategoria] = useState<string | null>(null);
  const [gravidade, setGravidade] = useState('media');
  const [descricao, setDescricao] = useState('');
  const [via, setVia] = useState('');
  const [endereco, setEndereco] = useState('');
  const [local, setLocal] = useState<Local | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [camera, setCamera] = useState(false);
  const [fotos, setFotos] = useState(0);
  const [proximas, setProximas] = useState<Proxima[]>([]);

  useEffect(() => {
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => { sair(); return true; });
    return () => assinatura.remove();
  });

  // Fotos desta ocorrência ainda na fila ou já enviadas nesta tela.
  useEffect(() => {
    const contar = () => itensPendentes().then((i) => setFotos((f) => Math.max(f, i.filter((x) => x.tipo === 'foto' && x.osId === id).length)));
    contar();
    return aoMudarFila(contar);
  }, [id]);

  async function capturar() {
    setCapturando(true);
    const pos = await posicaoAtual().catch(() => null);
    if (!pos) {
      setCapturando(false);
      return Alert.alert('Localização indisponível', 'Permita o acesso à localização e confira se o GPS está ligado.');
    }
    setLocal({ lat: pos.latitude, lng: pos.longitude, precisao: pos.accuracy ?? null, quando: new Date().toISOString() });
    setCapturando(false);
    ocorrenciasProximas(pos.latitude, pos.longitude).then(setProximas).catch(() => {});
    const texto = await enderecoDe(pos.latitude, pos.longitude, 5000);
    if (texto) setEndereco((e) => e || texto);
  }

  function validar() {
    if (!categoria) { Alert.alert('O que é a ocorrência?', 'Escolha o tipo da ocorrência.'); return false; }
    if (!descricao.trim()) { Alert.alert('Descreva a ocorrência', 'Conte o que foi visto e o que precisa ser feito.'); return false; }
    if (!local) { Alert.alert('Capture a localização', 'Toque em CAPTURAR LOCALIZAÇÃO no ponto da ocorrência.'); return false; }
    return true;
  }

  // Grava a O.S. na fila uma única vez (o id é gerado aqui; reenviar não duplica).
  async function registrar() {
    if (registrado) return true;
    if (!validar() || !local) return false;
    await enfileirar({
      tipo: 'rpc', nome: 'informar_evento',
      args: {
        p_id: id, p_categoria: categoria, p_gravidade: gravidade, p_descricao: descricao.trim(), p_via: via.trim() || null,
        p_lat: local.lat, p_lng: local.lng, p_precisao: local.precisao, p_endereco: endereco.trim() || null, p_quando: local.quando,
      },
    });
    setRegistrado(true);
    return true;
  }

  async function fotografar() {
    if (await registrar()) setCamera(true);
  }

  async function concluir() {
    if (!(await registrar())) return;
    if (fotos === 0) return Alert.alert('Falta a foto', 'Fotografe a ocorrência: as fotos orientam quem for executar.', [{ text: 'Fotografar', onPress: () => setCamera(true) }]);
    Alert.alert('Ocorrência informada', 'A O.S. foi para o Backlog. Você ou outro técnico pode assumir e iniciar a execução.', [{ text: 'OK', onPress: voltar }]);
  }

  function descartarDuplicada() {
    Alert.alert('Descartar esta ocorrência?', 'Ela já está registrada na O.S. aberta perto daqui. Nada será enviado.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: voltar },
    ]);
  }

  function sair() {
    if (camera) return;
    if (registrado || (!categoria && !descricao && !local)) return voltar();
    Alert.alert('Descartar ocorrência?', 'O que foi preenchido será perdido.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: voltar },
    ]);
  }

  const bloqueado = registrado;
  const chips = <T extends string>(lista: { valor: T; rotulo: string }[], valor: string | null, escolher: (v: T) => void) => (
    <View style={s.chips}>
      {lista.map((o) => (
        <Pressable key={o.valor} disabled={bloqueado} onPress={() => escolher(o.valor)} style={[s.chip, valor === o.valor && s.chipAtivo]}>
          <Text style={[s.chipTexto, valor === o.valor && { color: '#fff' }]}>{o.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Informar ocorrência" subtitulo="Vira O.S. no backlog" voltar={sair} />
      <RolarComTeclado keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.cartao}>
          <Text style={s.rotulo}>O QUE É A OCORRÊNCIA *</Text>
          {chips(CATEGORIAS.map((c) => ({ valor: c, rotulo: c })), categoria, setCategoria)}
          <Text style={s.rotulo}>GRAVIDADE</Text>
          {chips(GRAVIDADES, gravidade, setGravidade)}
          <Text style={s.rotulo}>DESCRIÇÃO *</Text>
          <TextInput style={[s.campo, { minHeight: 80, textAlignVertical: 'top' }]} multiline editable={!bloqueado} value={descricao}
            onChangeText={setDescricao} placeholder="O que foi visto e o que precisa ser feito" placeholderTextColor={cores.apagado} />
          <TextInput style={s.campo} editable={!bloqueado} value={via} onChangeText={setVia}
            placeholder="Via / km / trecho (ex.: BR-381 km 812, BB-13)" placeholderTextColor={cores.apagado} />
        </View>

        <View style={s.cartao}>
          <Text style={s.rotulo}>LOCALIZAÇÃO DA OCORRÊNCIA *</Text>
          <Pressable style={[s.capturar, { backgroundColor: local ? cores.sucesso : cores.primaria }]} onPress={capturar} disabled={capturando || bloqueado}>
            {capturando ? <ActivityIndicator color="#fff" /> : <Icone nome={local ? 'map-marker-check' : 'crosshairs-gps'} tamanho={22} cor="#fff" />}
            <Text style={s.capturarTexto}>{capturando ? 'CAPTURANDO...' : local ? 'LOCALIZAÇÃO CAPTURADA' : 'CAPTURAR LOCALIZAÇÃO'}</Text>
          </Pressable>
          {local ? (
            <>
              <Text style={s.coordenadas}>
                {local.lat.toFixed(6)}, {local.lng.toFixed(6)}{local.precisao != null ? ` · ±${Math.round(local.precisao)} m` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {!bloqueado ? (
                  <Pressable style={s.secundario} onPress={capturar}><Text style={s.secundarioTexto}>Capturar de novo</Text></Pressable>
                ) : null}
                <Pressable style={s.secundario} onPress={() => navegarAte({ lat: local.lat, lng: local.lng })}>
                  <Icone nome="navigation-variant-outline" tamanho={16} cor={cores.primaria} />
                  <Text style={s.secundarioTexto}>Waze / Google Maps</Text>
                </Pressable>
              </View>
            </>
          ) : <Text style={s.ajuda}>Fique no ponto da ocorrência e toque no botão. Funciona sem internet.</Text>}
          {proximas.length && !registrado ? (
            <View style={s.duplicada}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icone nome="content-duplicate" tamanho={18} cor={cores.alerta} />
                <Text style={s.duplicadaTitulo}>Já existe O.S. aberta a menos de 200 m</Text>
              </View>
              {proximas.map((o) => (
                <Text key={o.id} style={s.duplicadaItem}>
                  #{o.numero} · {o.titulo} · {Math.round(o.distancia_m)} m · aberta há {idadeOs(o.criado_em).texto}{o.tecnico ? ` · com ${o.tecnico}` : ' · no backlog'}
                </Text>
              ))}
              <Text style={s.duplicadaAjuda}>Se for o mesmo problema, não precisa informar de novo. Se for outro, continue normalmente.</Text>
              <Pressable style={[s.secundario, { flex: 0, marginTop: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F5D7A8' }]} onPress={descartarDuplicada}>
                <Text style={s.secundarioTexto}>É a mesma, descartar</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput style={s.campo} editable={!bloqueado} value={endereco} onChangeText={setEndereco} multiline
            placeholder="Endereço / referência" placeholderTextColor={cores.apagado} />
        </View>

        <View style={s.cartao}>
          <Text style={s.rotulo}>FOTOS DA OCORRÊNCIA</Text>
          <Text style={s.ajuda}>
            {fotos > 0 ? `${fotos} foto(s) tirada(s).` : 'Tire pelo menos uma foto (recomendado 3).'} Quem for executar vai usar estas fotos como guia para fotografar a correção no mesmo ângulo.
          </Text>
          <Pressable style={[s.capturar, { backgroundColor: cores.primaria }]} onPress={fotografar}>
            <Icone nome="camera-outline" tamanho={22} cor="#fff" />
            <Text style={s.capturarTexto}>{fotos > 0 ? 'TIRAR MAIS FOTOS' : 'FOTOGRAFAR'}</Text>
          </Pressable>
        </View>
      </RolarComTeclado>

      <View style={s.rodape}>
        <Pressable style={[s.concluir, { backgroundColor: cores.sucesso }]} onPress={concluir}>
          <Icone nome="send" tamanho={20} cor="#fff" />
          <Text style={s.capturarTexto}>Enviar para o backlog</Text>
        </Pressable>
      </View>

      <Modal visible={camera} onRequestClose={() => setCamera(false)} animationType="fade" supportedOrientations={['landscape', 'portrait']}>
        {camera ? (
          <CameraOS osId={id} fotosJaFeitas={fotos} minimo={MINIMO_FOTOS} usuario={usuario}
            fechar={() => { setCamera(false); itensPendentes().then((i) => setFotos((f) => Math.max(f, i.filter((x) => x.tipo === 'foto' && x.osId === id).length))); }} />
        ) : null}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: 18, marginHorizontal: 16, marginTop: 14, padding: 16, ...sombra },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#fff' },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.texto, fontSize: 14 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, fontSize: 15, backgroundColor: '#fff', marginTop: 8, color: cores.texto },
  capturar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14, marginTop: 8 },
  capturarTexto: { color: '#fff', fontSize: 15.5, fontWeight: '800', letterSpacing: 0.3 },
  coordenadas: { fontSize: 14, fontWeight: '600', color: cores.texto, marginTop: 10, textAlign: 'center' },
  secundario: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 12, backgroundColor: cores.selecionado },
  secundarioTexto: { color: cores.primaria, fontWeight: '700', fontSize: 13.5 },
  ajuda: { fontSize: 13, color: cores.suave, marginTop: 6 },
  duplicada: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#FFF4E5', borderWidth: 1, borderColor: '#F5D7A8' },
  duplicadaTitulo: { fontSize: 14, fontWeight: '800', color: '#7A4B00' },
  duplicadaItem: { fontSize: 13, color: cores.texto, marginTop: 6 },
  duplicadaAjuda: { fontSize: 12.5, color: '#7A4B00', marginTop: 8 },
  rodape: { backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda, padding: 12 },
  concluir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14 },
});
