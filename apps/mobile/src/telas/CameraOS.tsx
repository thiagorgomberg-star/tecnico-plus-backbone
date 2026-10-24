import { CameraView, useCameraPermissions } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import MascaraFoto, { DadosMascara, RefMascara } from '../componentes/MascaraFoto';
import { enfileirar } from '../lib/fila';
import { cores } from '../lib/estilo';
import { posicaoAtual } from '../lib/localizacao';

type Props = {
  osId: string;
  fotosJaFeitas: number;
  minimo: number;
  usuario: { nome: string; cargo: string | null };
  fechar: () => void;
};

const LARGURA_FINAL = 1600;

// Endereço só quando houver internet; offline a máscara sai só com as coordenadas.
async function enderecoDe(latitude: number, longitude: number) {
  try {
    const consulta = Location.reverseGeocodeAsync({ latitude, longitude });
    const limite = new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo')), 2500));
    const [r] = await Promise.race([consulta, limite]);
    if (!r) return null;
    const rua = [r.street, r.streetNumber].filter(Boolean).join(', ');
    return [rua, r.district, r.city ?? r.subregion].filter(Boolean).join(' - ') +
      (r.region ? ` - ${r.region}` : '') + (r.postalCode ? `, ${r.postalCode}` : '');
  } catch {
    return null;
  }
}

export default function CameraOS({ osId, fotosJaFeitas, minimo, usuario, fechar }: Props) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const mascara = useRef<RefMascara>(null);
  const { width, height } = useWindowDimensions();
  const [tipo, setTipo] = useState<'foto_antes' | 'foto_depois'>('foto_antes');
  const [dados, setDados] = useState<DadosMascara | null>(null);
  const [processando, setProcessando] = useState(false);
  const [miniaturas, setMiniaturas] = useState<string[]>([]);
  const horizontal = width > height;
  const total = fotosJaFeitas + miniaturas.length;

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  async function fotografar() {
    if (!camera.current || processando) return;
    setProcessando(true);
    try {
      const [foto, pos] = await Promise.all([camera.current.takePictureAsync({ quality: 0.85 }), posicaoAtual()]);
      if (foto.width <= foto.height) {
        Alert.alert('Foto na vertical', 'Gire o celular na horizontal e tire a foto de novo.');
        setProcessando(false);
        return;
      }
      const endereco = pos ? await enderecoDe(pos.latitude, pos.longitude) : null;
      setDados({
        uri: foto.uri,
        larguraFoto: foto.width,
        alturaFoto: foto.height,
        tiradaEm: new Date(),
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        endereco,
        nome: usuario.nome,
        cargo: usuario.cargo,
      });
    } catch (e) {
      Alert.alert('Erro ao tirar a foto', String(e));
      setProcessando(false);
    }
  }

  // Chamado quando a máscara terminou de desenhar a foto: grava a imagem final e põe na fila.
  async function salvarComMascara() {
    if (!dados || !mascara.current) return;
    try {
      const alturaFinal = Math.round((LARGURA_FINAL * dados.alturaFoto * 1.137) / dados.larguraFoto);
      const temporario = await captureRef(mascara, { format: 'jpg', quality: 0.85, width: LARGURA_FINAL, height: alturaFinal });
      const pasta = new Directory(Paths.document, 'fotos');
      if (!pasta.exists) pasta.create();
      const destino = new File(pasta, `${randomUUID()}.jpg`);
      await new File(temporario).move(destino);
      await enfileirar({
        tipo: 'foto',
        osId,
        tipoAnexo: tipo,
        arquivo: destino.uri,
        largura: LARGURA_FINAL,
        altura: alturaFinal,
        tiradaEm: dados.tiradaEm.toISOString(),
        latitude: dados.latitude,
        longitude: dados.longitude,
      });
      setMiniaturas((m) => [destino.uri, ...m]);
    } catch (e) {
      Alert.alert('Erro ao salvar a foto', String(e));
    } finally {
      setDados(null);
      setProcessando(false);
    }
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
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      {!horizontal && (
        <View style={estilos.aviso}>
          <Text style={[estilos.texto, { fontSize: 20, textAlign: 'center' }]}>Gire o celular na horizontal</Text>
        </View>
      )}

      <View style={estilos.topo}>
        <Pressable onPress={fechar}><Text style={estilos.texto}>‹ Concluir fotos</Text></Pressable>
        <Text style={[estilos.texto, { color: total >= minimo ? '#8BE28F' : '#FFD54F' }]}>
          {total}/{minimo} fotos
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['foto_antes', 'foto_depois'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTipo(t)} style={[estilos.chip, tipo === t && { backgroundColor: cores.primaria }]}>
              <Text style={estilos.texto}>{t === 'foto_antes' ? 'Antes' : 'Depois'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView horizontal style={estilos.miniaturas}>
        {miniaturas.map((uri) => <Image key={uri} source={{ uri }} style={estilos.miniatura} />)}
      </ScrollView>

      <Pressable style={[estilos.disparo, (!horizontal || processando) && { opacity: 0.4 }]}
        disabled={!horizontal || processando} onPress={fotografar}>
        {processando ? <ActivityIndicator color={cores.primaria} /> : null}
      </Pressable>

      {/* Desenhada fora da tela só para gerar a imagem final com a máscara. */}
      {dados && (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
          <MascaraFoto ref={mascara} dados={dados} aoCarregar={() => setTimeout(salvarComMascara, 150)} />
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
  miniatura: { width: 96, height: 60, marginRight: 8, borderRadius: 4, borderWidth: 1, borderColor: '#fff' },
  disparo: { position: 'absolute', right: 24, top: '50%', marginTop: -36, width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  botao: { marginTop: 16, backgroundColor: cores.primaria, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
});
