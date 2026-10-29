import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import Icone from '../componentes/Icone';
import MascaraFoto, { DadosMascara, RefMascara } from '../componentes/MascaraFoto';
import { compartilharFoto } from '../lib/compartilharFoto';
import { minhaEquipe, MinhaEquipe } from '../lib/equipe';
import { caminhoFotoOs, enfileirar, legendarFoto } from '../lib/fila';
import { cores } from '../lib/estilo';
import { enderecoDe } from '../lib/localizacao';
import { referenciasLocais } from '../lib/referencia';

type Props = {
  osId: string;
  fotosJaFeitas: number;
  minimo: number;
  tipoInicial?: 'foto_antes' | 'foto_depois';
  usuario: { nome: string; cargo: string | null };
  fechar: () => void;
  // Fotos de uma caixa (ou da tela do OTDR de uma fibra) em vez das fotos antes/depois da O.S.
  caixa?: { id: string; tipo: 'foto_caixa' | 'foto_otdr' | 'foto_bandeja' | 'foto_olt'; fibra?: number; bandeja?: number; titulo: string };
  // Fotos de um poste/ocorrência da Vistoria Backbone MG.
  ponto?: { id: string; titulo: string };
  // Foto única fora da O.S. (ex.: Inventário Matinal): entrega a foto com máscara e fecha a câmera.
  unica?: { titulo: string; aoSalvar: (foto: { arquivo: string; tiradaEm: string; latitude: number | null; longitude: number | null }) => void };
};

// 1920 px com JPEG 0,85: foto bem nítida com a máscara legível, ainda leve o bastante para dados móveis.
const LARGURA_FINAL = 1920;

// Foto tirada mas ainda sem máscara. Fica gravada no celular (arquivo + dados) desde o clique,
// para não se perder se o app fechar antes da máscara: na próxima abertura da câmera ela é terminada.
type FotoCrua = Omit<DadosMascara, 'tiradaEm'> & {
  tiradaEm: string;
  osId: string;
  tipoAnexo: 'foto_antes' | 'foto_depois' | 'foto_caixa' | 'foto_otdr' | 'foto_bandeja' | 'foto_olt' | 'foto_ponto';
  caixaId?: string;
  pontoId?: string;
  fibra?: number;
  bandeja?: number;
};
const CHAVE_CRUAS = 'fotos-sem-mascara';

async function lerCruas(): Promise<FotoCrua[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CHAVE_CRUAS)) ?? '[]');
  } catch {
    return [];
  }
}

// Serializa as gravações para uma não apagar a outra.
let gravando: Promise<unknown> = Promise.resolve();
function alterarCruas(mudar: (l: FotoCrua[]) => FotoCrua[]) {
  const proxima = gravando.then(async () => {
    const lista = mudar(await lerCruas());
    await AsyncStorage.setItem(CHAVE_CRUAS, JSON.stringify(lista));
  });
  gravando = proxima.catch(() => undefined);
  return proxima;
}

// Quantas fotos desta O.S./caixa ainda esperam a máscara (contam como tiradas).
export async function fotosPendentesDeMascara(osId: string, caixaId?: string) {
  return (await lerCruas()).filter((f) => f.osId === osId && (!caixaId || f.caixaId === caixaId)).length;
}

// Menor resolução da câmera que ainda cobre a largura final: foto bem mais leve de tirar e de processar.
function melhorTamanho(tamanhos: string[]) {
  const validos = tamanhos
    .map((t) => { const [l, a] = t.split('x').map(Number); return { t, l: Math.max(l, a), a: Math.min(l, a) }; })
    .filter((x) => x.l >= LARGURA_FINAL && Math.abs(x.l / x.a - 4 / 3) < 0.05);
  validos.sort((x, y) => x.l * x.a - y.l * y.a);
  return validos[0]?.t;
}

// EXIF: coordenada em graus decimais ou [graus, minutos, segundos]; S/W ficam negativos.
function coordExif(v: unknown, ref: unknown): number | null {
  const n = Array.isArray(v) ? Number(v[0]) + Number(v[1] ?? 0) / 60 + Number(v[2] ?? 0) / 3600 : typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n === 0) return null;
  return /^[SW]/i.test(String(ref ?? '')) ? -Math.abs(n) : n;
}
// EXIF "2026:10:28 14:03:22" (hora local do celular).
function dataExif(v: unknown): Date | null {
  const m = typeof v === 'string' ? v.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/) : null;
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Distância aproximada em metros (suficiente para decidir se o endereço precisa ser consultado de novo).
function distancia(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dy = (a.latitude - b.latitude) * 111320;
  const dx = (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export default function CameraOS({ osId, fotosJaFeitas, minimo, tipoInicial, usuario, fechar, caixa, ponto, unica }: Props) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const mascara = useRef<RefMascara>(null);
  const { width, height } = useWindowDimensions();
  const [tipo, setTipo] = useState<'foto_antes' | 'foto_depois'>(tipoInicial ?? 'foto_antes');
  // Fotos já tiradas esperando a máscara: o técnico pode seguir fotografando enquanto elas são gravadas.
  const [fila, setFila] = useState<(FotoCrua | (DadosMascara & { unica: true }))[]>([]);
  const atual = fila[0] ?? null;
  const dados: DadosMascara | null = atual ? { ...atual, tiradaEm: new Date(atual.tiradaEm) } : null;
  const [tirando, setTirando] = useState(false);
  const [tamanho, setTamanho] = useState<string | undefined>();
  // Lente mais aberta do celular (0,5x, quando tem). Zoom 0 = lente mais aberta (APK 15+); quase 0 = 1x.
  // Só vai para 0 depois que a câmera abre, quando o aparelho já informou as lentes.
  const [ampla, setAmpla] = useState(true);
  const [pronta, setPronta] = useState(false);
  const [lanterna, setLanterna] = useState(false);
  const posicao = useRef<{ latitude: number; longitude: number } | null>(null);
  const endereco = useRef<{ latitude: number; longitude: number; texto: string } | null>(null);
  const consultando = useRef(false);
  const [miniaturas, setMiniaturas] = useState<string[]>([]);
  // Técnico, auxiliar e classe da equipe para a máscara (guardado para funcionar sem sinal).
  const [equipe, setEquipe] = useState<MinhaEquipe | null>(null);
  useEffect(() => { minhaEquipe().then(setEquipe).catch(() => {}); }, []);
  // Balão "+ Legenda" da última foto (antes/depois). Some sozinho: sem toque, a foto segue sem legenda.
  const [balao, setBalao] = useState<{ uri: string; osId: string } | null>(null);
  const [escrevendo, setEscrevendo] = useState<{ uri: string; osId: string } | null>(null);
  const [legenda, setLegenda] = useState('');
  // Foto crua -> id na fila (para achar o caminho no servidor); legenda escrita antes da máscara terminar.
  const filaDaFoto = useRef(new Map<string, string>());
  const legendaPendente = useRef(new Map<string, string>());
  const timerBalao = useRef<ReturnType<typeof setTimeout> | null>(null);
  // O.S. gerada na vistoria: as fotos do ponto servem de guia para fotografar a correção no mesmo ângulo.
  const [referencias, setReferencias] = useState<string[]>([]);
  const [refAtual, setRefAtual] = useState(0);
  const [sobrepor, setSobrepor] = useState(true);
  useEffect(() => {
    if (!caixa && !ponto && !unica) referenciasLocais(osId).then(setReferencias).catch(() => {});
  }, [osId, caixa, ponto, unica]);
  const referencia = referencias[refAtual] ?? null;
  const horizontal = width > height;
  const total = fotosJaFeitas + miniaturas.length;

  // Retoma as fotos que ficaram sem máscara (app fechado no meio): cada uma volta com a O.S./caixa dela.
  useEffect(() => {
    if (unica) return;
    lerCruas().then((cruas) => {
      const existentes = cruas.filter((f) => new File(f.uri).exists);
      if (existentes.length !== cruas.length) alterarCruas((l) => l.filter((f) => new File(f.uri).exists));
      if (existentes.length) setFila((f) => [...existentes, ...f.filter((x) => !existentes.some((e) => e.uri === x.uri))]);
    });
  }, []);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // GPS acompanhando enquanto a câmera está aberta: a foto usa a última posição na hora, sem esperar o satélite.
  // O endereço só é consultado de novo quando o técnico anda mais de 30 m.
  useEffect(() => {
    let assinatura: Location.LocationSubscription | null = null;
    let ativo = true;
    const atualizar = (c: { latitude: number; longitude: number }) => {
      posicao.current = { latitude: c.latitude, longitude: c.longitude };
      const ultimo = endereco.current;
      if (consultando.current || (ultimo?.texto && distancia(ultimo, c) < 30)) return;
      consultando.current = true;
      enderecoDe(c.latitude, c.longitude, 8000).then((texto) => {
        consultando.current = false;
        if (ativo && texto) endereco.current = { latitude: c.latitude, longitude: c.longitude, texto };
      });
    };
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !ativo) return;
      const ultima = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
      if (ultima && ativo) atualizar(ultima.coords);
      assinatura = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
        (p) => atualizar(p.coords),
      );
      if (!ativo) assinatura.remove();
    })();
    return () => {
      ativo = false;
      assinatura?.remove();
    };
  }, []);

  async function cameraPronta() {
    setTimeout(() => setPronta(true), 300);
    try {
      setTamanho(melhorTamanho((await camera.current?.getAvailablePictureSizesAsync()) ?? []));
    } catch {
      // fica com o tamanho padrão da câmera
    }
  }

  async function fotografar() {
    if (!camera.current || tirando) return;
    setTirando(true);
    try {
      const foto = await camera.current.takePictureAsync({ quality: 0.92, shutterSound: false });
      if (foto.width <= foto.height) {
        Alert.alert('Foto na vertical', 'Gire o celular na horizontal e tire a foto de novo.');
        return;
      }
      await registrar(foto);
    } catch (e) {
      Alert.alert('Erro ao tirar a foto', String(e));
    } finally {
      setTirando(false);
    }
  }

  // Foto da galeria: usa data e GPS gravados na foto (EXIF). Sem GPS na foto, fica sem localização (não usa a de agora).
  async function daGaleria() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: !unica, exif: true, quality: 1 });
    if (r.canceled) return;
    setTirando(true);
    try {
      for (const a of r.assets) {
        const exif = (a.exif ?? {}) as Record<string, unknown>;
        const lat = coordExif(exif.GPSLatitude, exif.GPSLatitudeRef);
        const lng = coordExif(exif.GPSLongitude, exif.GPSLongitudeRef);
        const data = dataExif(exif.DateTimeOriginal ?? exif.DateTime);
        const gps = lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
        const texto = gps ? await enderecoDe(gps.latitude, gps.longitude, 8000).catch(() => null) : undefined;
        // A cópia vai para o cache: registrar() move o arquivo, e o original da galeria não pode sumir.
        const copia = new File(Paths.cache, `galeria-${randomUUID()}.jpg`);
        new File(a.uri).copy(copia);
        await registrar({ uri: copia.uri, width: a.width, height: a.height }, { tiradaEm: data, posicao: gps, endereco: gps ? texto ?? null : null });
      }
    } catch (e) {
      Alert.alert('Erro ao trazer da galeria', String(e));
    } finally {
      setTirando(false);
    }
  }

  async function registrar(foto: { uri: string; width: number; height: number },
    origem?: { tiradaEm: Date | null; posicao: { latitude: number; longitude: number } | null; endereco?: string | null }) {
      // Foto da galeria nunca recebe a posição de agora: só a gravada nela (se tiver).
      const pos = origem ? origem.posicao : posicao.current;
      const tiradaEm = origem?.tiradaEm ?? new Date();
      const base = {
        uri: foto.uri,
        larguraFoto: foto.width,
        alturaFoto: foto.height,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        endereco: origem?.endereco !== undefined ? origem.endereco : endereco.current?.texto ?? null,
        nome: equipe?.tecnico.nome ?? usuario.nome,
        cargo: equipe ? equipe.tecnico.cargo : usuario.cargo,
        auxiliar: equipe?.auxiliares.map((a) => a.nome).join(', ') || null,
        classe: equipe?.classe ?? null,
      };
      if (unica) {
        setFila((f) => [...f, { ...base, tiradaEm, unica: true }]);
        return;
      }
      // Tira a foto do cache e grava os dados antes de qualquer outra coisa.
      const pasta = new Directory(Paths.document, 'fotos-sem-mascara');
      if (!pasta.exists) pasta.create();
      const arquivo = new File(pasta, `${randomUUID()}.jpg`);
      new File(foto.uri).move(arquivo);
      const crua: FotoCrua = {
        ...base,
        uri: arquivo.uri,
        tiradaEm: tiradaEm.toISOString(),
        osId,
        tipoAnexo: ponto ? 'foto_ponto' : caixa?.tipo ?? tipo,
        caixaId: caixa?.id,
        pontoId: ponto?.id,
        fibra: caixa?.fibra,
        bandeja: caixa?.bandeja,
      };
      await alterarCruas((l) => [...l, crua]);
      setFila((f) => [...f, crua]);
      if (crua.tipoAnexo === 'foto_antes' || crua.tipoAnexo === 'foto_depois') {
        setBalao({ uri: crua.uri, osId: crua.osId });
        if (timerBalao.current) clearTimeout(timerBalao.current);
        timerBalao.current = setTimeout(() => setBalao(null), 7000);
      }
  }

  // Chamado quando a máscara terminou de desenhar a foto: grava a imagem final e põe na fila.
  async function salvarComMascara() {
    if (!atual || !dados || !mascara.current) return;
    try {
      const alturaFinal = Math.round((LARGURA_FINAL * dados.alturaFoto * 1.137) / dados.larguraFoto);
      const temporario = await captureRef(mascara, { format: 'jpg', quality: 0.92, width: LARGURA_FINAL, height: alturaFinal });
      const pasta = new Directory(Paths.document, 'fotos');
      if (!pasta.exists) pasta.create();
      const destino = new File(pasta, `${randomUUID()}.jpg`);
      await new File(temporario).move(destino);
      if ('unica' in atual) {
        unica?.aoSalvar({ arquivo: destino.uri, tiradaEm: dados.tiradaEm.toISOString(), latitude: dados.latitude, longitude: dados.longitude });
        fechar();
        return;
      }
      const filaId = await enfileirar({
        tipo: 'foto',
        osId: atual.osId,
        tipoAnexo: atual.tipoAnexo,
        caixaId: atual.caixaId,
        pontoId: atual.pontoId,
        fibra: atual.fibra,
        bandeja: atual.bandeja,
        arquivo: destino.uri,
        largura: LARGURA_FINAL,
        altura: alturaFinal,
        tiradaEm: dados.tiradaEm.toISOString(),
        latitude: dados.latitude,
        longitude: dados.longitude,
      });
      filaDaFoto.current.set(atual.uri, filaId);
      const pendente = legendaPendente.current.get(atual.uri);
      if (pendente) {
        legendaPendente.current.delete(atual.uri);
        await legendarFoto(caminhoFotoOs(atual.osId, filaId), pendente);
      }
      await alterarCruas((l) => l.filter((f) => f.uri !== atual.uri));
      try { new File(atual.uri).delete(); } catch { /* já removida */ }
      // Só conta aqui a foto que é deste alvo; as retomadas de outra O.S./caixa vão para a fila delas.
      if (atual.osId === osId && atual.caixaId === caixa?.id && atual.pontoId === ponto?.id && atual.fibra === caixa?.fibra && atual.bandeja === caixa?.bandeja) {
        setMiniaturas((m) => [destino.uri, ...m]);
      }
    } catch (e) {
      Alert.alert('Erro ao salvar a foto', String(e));
    } finally {
      setFila((f) => f.slice(1));
    }
  }

  async function gravarLegenda() {
    const alvo = escrevendo;
    setEscrevendo(null);
    if (!alvo || !legenda.trim()) return;
    const filaId = filaDaFoto.current.get(alvo.uri);
    if (filaId) await legendarFoto(caminhoFotoOs(alvo.osId, filaId), legenda);
    else legendaPendente.current.set(alvo.uri, legenda);
  }

  if (!permissao) return null;
  if (!permissao.granted) {
    return (
      <View style={[estilos.tela, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={estilos.texto}>O app precisa da câmera para registrar as fotos da O.S.</Text>
        <Pressable style={estilos.botao} onPress={pedirPermissao}><Text style={estilos.texto}>Permitir câmera</Text></Pressable>
        <Pressable onPress={fechar}><Text style={[estilos.texto, { marginTop: 16 }]}>Voltar</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={estilos.tela}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" pictureSize={tamanho} onCameraReady={cameraPronta}
        zoom={ampla && pronta ? 0 : 0.000001} enableTorch={lanterna} />
      {referencia && sobrepor ? (
        <Image source={{ uri: referencia }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} resizeMode="cover" pointerEvents="none" />
      ) : null}
      {referencia ? (
        <View style={estilos.guia}>
          <Pressable onPress={() => setRefAtual((i) => (i + 1) % referencias.length)}>
            <Image source={{ uri: referencia }} style={estilos.guiaFoto} />
          </Pressable>
          <Text style={estilos.guiaTexto}>Mesmo ângulo da vistoria{referencias.length > 1 ? ` · ${refAtual + 1}/${referencias.length} (toque p/ trocar)` : ''}</Text>
          <Pressable style={[estilos.chip, sobrepor && { backgroundColor: cores.primaria }]} onPress={() => setSobrepor((v) => !v)}>
            <Text style={[estilos.texto, { fontSize: 13 }]}>{sobrepor ? 'Guia ligado' : 'Guia desligado'}</Text>
          </Pressable>
        </View>
      ) : null}

      {!horizontal && (
        <View style={estilos.aviso}>
          <Text style={[estilos.texto, { fontSize: 20, textAlign: 'center' }]}>Gire o celular na horizontal</Text>
        </View>
      )}

      <View style={estilos.topo}>
        <Pressable onPress={() => (fila.length ? Alert.alert('Aguarde', 'Ainda gravando as últimas fotos.') : fechar())}>
          <Text style={estilos.texto}>‹ Concluir fotos</Text>
        </Pressable>
        <Text style={[estilos.texto, { color: !minimo ? '#fff' : total >= minimo ? '#8BE28F' : '#FFD54F' }]}>
          {minimo ? `${total}/${minimo}` : total} {total === 1 && !minimo ? 'foto' : 'fotos'}{fila.length ? ` · gravando ${fila.length}` : ''}
        </Text>
        <Pressable onPress={() => setLanterna((v) => !v)} style={[estilos.chip, lanterna && { backgroundColor: '#F5B700' }]}
          accessibilityLabel={lanterna ? 'Desligar lanterna' : 'Ligar lanterna'}>
          <Text style={estilos.texto}>{lanterna ? '🔦 Ligada' : '🔦 Lanterna'}</Text>
        </Pressable>
        <Pressable onPress={() => setAmpla((v) => !v)} style={[estilos.chip, ampla && { backgroundColor: cores.primaria }]}
          accessibilityLabel={ampla ? 'Lente aberta (0,5x). Tocar para 1x' : 'Lente normal (1x). Tocar para abrir'}>
          <Text style={estilos.texto}>{ampla ? '0,5x' : '1x'}</Text>
        </Pressable>
        {caixa || ponto || unica ? <Text style={estilos.texto}>{caixa?.titulo ?? ponto?.titulo ?? unica?.titulo}</Text> : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['foto_antes', 'foto_depois'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTipo(t)} style={[estilos.chip, tipo === t && { backgroundColor: cores.primaria }]}>
              <Text style={estilos.texto}>{t === 'foto_antes' ? 'Antes' : 'Depois'}</Text>
            </Pressable>
          ))}
        </View>
        )}
      </View>

      <ScrollView horizontal style={estilos.miniaturas}>
        {/* Tocar na miniatura abre o Compartilhar (WhatsApp) da foto já com a máscara. */}
        {miniaturas.map((uri) => (
          <Pressable key={uri} onPress={() => compartilharFoto(uri, 'Foto da O.S.')} accessibilityLabel="Compartilhar esta foto">
            <Image source={{ uri }} style={estilos.miniatura} />
          </Pressable>
        ))}
      </ScrollView>

      {balao ? (
        <Pressable style={estilos.balao} onPress={() => { setEscrevendo(balao); setLegenda(''); setBalao(null); }}
          accessibilityLabel="Escrever legenda da última foto">
          <Text style={estilos.balaoMais}>+</Text>
          <Text style={estilos.texto}>Legenda</Text>
          <View style={estilos.balaoPonta} />
        </Pressable>
      ) : null}

      <Modal visible={!!escrevendo} transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={() => setEscrevendo(null)}>
        <View style={estilos.legendaFundo}>
          <View style={estilos.legendaCaixa}>
            <Text style={estilos.legendaRotulo}>Legenda da foto (aparece no relatório)</Text>
            <TextInput autoFocus value={legenda} onChangeText={setLegenda} maxLength={300} multiline placeholder="Ex.: cabo rompido por queda de árvore"
              placeholderTextColor={cores.apagado} style={estilos.legendaCampo} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable style={[estilos.legendaBotao, { backgroundColor: '#eee' }]} onPress={() => setEscrevendo(null)}>
                <Text style={{ fontWeight: '700', color: cores.texto }}>Sem legenda</Text>
              </Pressable>
              <Pressable style={[estilos.legendaBotao, { backgroundColor: cores.primaria }]} onPress={gravarLegenda}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>Salvar legenda</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Pressable style={[estilos.galeria, tirando && { opacity: 0.4 }]} disabled={tirando} onPress={daGaleria}
        accessibilityLabel="Enviar foto da galeria">
        <Icone nome="image-multiple" tamanho={22} cor="#fff" />
        <Text style={[estilos.texto, { fontSize: 13 }]}>Galeria</Text>
      </Pressable>

      <Pressable style={[estilos.disparo, (!horizontal || tirando) && { opacity: 0.4 }]}
        disabled={!horizontal || tirando} onPress={fotografar}>
        {tirando ? <ActivityIndicator color={cores.primaria} /> : null}
      </Pressable>

      {/* Desenhada fora da tela só para gerar a imagem final com a máscara. */}
      {dados && (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
          <MascaraFoto key={dados.uri} ref={mascara} dados={dados} aoCarregar={() => setTimeout(salvarComMascara, 400)} />
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000' },
  texto: { color: '#fff', fontSize: 16, fontWeight: '600' },
  topo: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  aviso: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  miniaturas: { position: 'absolute', left: 16, bottom: 16, right: 120, maxHeight: 64 },
  guia: { position: 'absolute', left: 16, top: 56, width: 180, gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 8 },
  guiaFoto: { width: 164, height: 104, borderRadius: 6, borderWidth: 2, borderColor: '#FFD54F' },
  guiaTexto: { color: '#FFD54F', fontSize: 12, fontWeight: '700' },
  miniatura: { width: 96, height: 60, marginRight: 8, borderRadius: 4, borderWidth: 1, borderColor: '#fff' },
  galeria: { position: 'absolute', right: 20, bottom: 24, alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  disparo: { position: 'absolute', right: 24, top: '50%', marginTop: -36, width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  balao: { position: 'absolute', right: 108, top: '50%', marginTop: -24, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: cores.primaria, paddingHorizontal: 14, height: 48, borderRadius: 24 },
  balaoMais: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: -3 },
  balaoPonta: { position: 'absolute', right: -6, top: 18, width: 12, height: 12, backgroundColor: cores.primaria, transform: [{ rotate: '45deg' }] },
  legendaFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 24 },
  legendaCaixa: { width: '70%', backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  legendaRotulo: { fontSize: 14, fontWeight: '700', color: cores.texto2, marginBottom: 6 },
  legendaCampo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 8, padding: 10, fontSize: 16, minHeight: 48, color: cores.texto },
  legendaBotao: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  botao: { marginTop: 16, backgroundColor: cores.primaria, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
});
