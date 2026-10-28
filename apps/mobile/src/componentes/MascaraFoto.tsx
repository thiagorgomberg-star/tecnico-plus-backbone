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
  nome: string; // técnico responsável (mesmo quando quem fotografa é o auxiliar)
  cargo: string | null;
  auxiliar?: string | null;
  classe?: 'L' | 'F' | null;
};

export type RefMascara = ComponentRef<typeof View>;
type Props = { dados: DadosMascara; aoCarregar?: () => void; ref?: Ref<RefMascara> };

export default function MascaraFoto({ dados, aoCarregar, ref }: Props) {
  const s = LARGURA_MASCARA / REF;
  const alturaFoto = (LARGURA_MASCARA * dados.alturaFoto) / dados.larguraFoto;
  const alturaBarra = alturaFoto * 0.15;

  return (
    <View ref={ref} collapsable={false} style={{ width: LARGURA_MASCARA, backgroundColor: '#fff' }}>
      <View style={{ width: LARGURA_MASCARA, height: alturaFoto }}>
        {/* fadeDuration 0: no Android a imagem entra com fade de 300 ms; capturada no meio dele, a foto sai esbranquiçada. */}
        <Image source={{ uri: dados.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} onLoad={aoCarregar} />
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
            // Endereço numa caixa escura, maior e em negrito: legível mesmo sobre céu ou estrada clara.
            <View style={{ marginTop: 10 * s, paddingHorizontal: 12 * s, paddingVertical: 6 * s, borderRadius: 4 * s,
              backgroundColor: 'rgba(0,0,0,0.6)', alignSelf: 'flex-start', maxWidth: 940 * s }}>
              <Text style={{ color: '#fff', fontSize: 40 * s, lineHeight: 48 * s, fontFamily: 'RobotoCondensed_700Bold' }}>
                {dados.endereco}
              </Text>
            </View>
          ) : null}
          {dados.latitude != null && dados.longitude != null ? (
            <View style={{ marginTop: 12 * s, paddingHorizontal: 12 * s, paddingVertical: 8 * s, borderRadius: 4 * s,
              backgroundColor: 'rgba(0,0,0,0.6)', alignSelf: 'flex-start', minWidth: 480 * s }}>
              <Text style={{ color: '#fff', fontSize: 34 * s, fontFamily: 'RobotoCondensed_400Regular' }}>
                Lat/Long: {latLong(dados.latitude, dados.longitude)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* Técnico em cima, auxiliar embaixo; classe da equipe ao lado do logo. */}
      <View style={{ minHeight: alturaBarra, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28 * s, paddingVertical: 8 * s }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#111', fontSize: 46 * s, fontFamily: 'RobotoCondensed_700Bold' }} numberOfLines={1}>
            {dados.nome}
            {dados.cargo ? <Text style={{ color: '#333', fontSize: 34 * s, fontFamily: 'RobotoCondensed_400Regular' }}>{`  ${dados.cargo}`}</Text> : null}
          </Text>
          {dados.auxiliar ? (
            <Text style={{ color: '#222', fontSize: 38 * s, marginTop: 4 * s, fontFamily: 'RobotoCondensed_400Regular' }} numberOfLines={1}>
              Auxiliar: <Text style={{ fontFamily: 'RobotoCondensed_700Bold' }}>{dados.auxiliar}</Text>
            </Text>
          ) : null}
        </View>
        {dados.classe ? (
          <View style={{ borderWidth: 3 * s, borderColor: '#1a237e', borderRadius: 8 * s, paddingHorizontal: 14 * s, paddingVertical: 4 * s, marginRight: 20 * s, alignItems: 'center' }}>
            <Text style={{ color: '#1a237e', fontSize: 24 * s, fontFamily: 'RobotoCondensed_700Bold' }}>EQUIPE</Text>
            <Text style={{ color: '#1a237e', fontSize: 40 * s, lineHeight: 44 * s, fontFamily: 'RobotoCondensed_700Bold' }}>CLASSE {dados.classe}</Text>
          </View>
        ) : null}
        <Image source={require('../../assets/mascara/logo-multivale.png')}
          style={{ width: 180 * s, height: 96 * s }} resizeMode="contain" fadeDuration={0} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  sombra: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
});

