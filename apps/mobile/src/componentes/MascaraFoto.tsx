import type { ComponentRef, Ref } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { dataCurta, diaSemana, hora, latLong } from '../lib/formato';

// Layout fixo da máscara padrão Multivale (docs/mascara-referencia.jpg).
// Medidas tiradas da referência de 1599 px de largura e escaladas pela largura renderizada.
const REF = 1599;
export const LARGURA_MASCARA = 800;

export type DadosMascara = {
  uri: string;
  larguraFoto: number;
  alturaFoto: number;
  tiradaEm: Date;
  latitude: number | null;
  longitude: number | null;
  endereco: string | null;
  nome: string;
  cargo: string | null;
};

export type RefMascara = ComponentRef<typeof View>;
type Props = { dados: DadosMascara; aoCarregar?: () => void; ref?: Ref<RefMascara> };

export default function MascaraFoto({ dados, aoCarregar, ref }: Props) {
  const s = LARGURA_MASCARA / REF;
  const alturaFoto = (LARGURA_MASCARA * dados.alturaFoto) / dados.larguraFoto;
  const alturaBarra = alturaFoto * 0.137;

  return (
    <View ref={ref} collapsable={false} style={{ width: LARGURA_MASCARA, backgroundColor: '#fff' }}>
      <View style={{ width: LARGURA_MASCARA, height: alturaFoto }}>
        <Image source={{ uri: dados.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={aoCarregar} />
        <View style={{ position: 'absolute', left: 18 * s, bottom: 16 * s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[estilos.sombra, { color: '#fff', fontSize: 100 * s, fontFamily: 'RobotoCondensed_400Regular' }]}>
              {hora(dados.tiradaEm)}
            </Text>
            <View style={{ width: 3 * s, height: 78 * s, backgroundColor: '#1a237e', marginHorizontal: 14 * s }} />
            <View>
              <Text style={[estilos.sombra, { color: '#fff', fontSize: 27 * s, fontFamily: 'RobotoCondensed_400Regular' }]}>{dataCurta(dados.tiradaEm)}</Text>
              <Text style={[estilos.sombra, { color: '#fff', fontSize: 27 * s, marginTop: 14 * s, fontFamily: 'RobotoCondensed_400Regular' }]}>{diaSemana(dados.tiradaEm)}</Text>
            </View>
          </View>
          {dados.endereco ? (
            <Text style={[estilos.sombra, { color: '#fff', fontSize: 30 * s, maxWidth: 560 * s, marginTop: 6 * s, fontFamily: 'RobotoCondensed_400Regular' }]}>
              {dados.endereco}
            </Text>
          ) : null}
          {dados.latitude != null && dados.longitude != null ? (
            <View style={{ marginTop: 12 * s, paddingHorizontal: 12 * s, paddingVertical: 8 * s, borderRadius: 4 * s,
              backgroundColor: 'rgba(60,60,60,0.75)', alignSelf: 'flex-start', minWidth: 480 * s }}>
              <Text style={{ color: '#fff', fontSize: 30 * s, fontFamily: 'RobotoCondensed_400Regular' }}>
                Lat/Long: {latLong(dados.latitude, dados.longitude)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ height: alturaBarra, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28 * s }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#222', fontSize: 27 * s, fontFamily: 'RobotoCondensed_700Bold' }}>{dados.nome}</Text>
          {dados.cargo ? <Text style={{ color: '#333', fontSize: 23 * s, marginTop: 6 * s, fontFamily: 'RobotoCondensed_400Regular' }}>{dados.cargo}</Text> : null}
        </View>
        <Image source={require('../../assets/mascara/logo-multivale.png')}
          style={{ width: 140 * s, height: 74 * s }} resizeMode="contain" />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  sombra: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
});

