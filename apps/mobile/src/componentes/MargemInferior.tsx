import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cores } from '../lib/estilo';

// Espaço da barra de navegação do Android no fim das telas cheias (modais), para os botões não ficarem atrás dela.
export default function MargemInferior({ cor = cores.cartao }: { cor?: string }) {
  const { bottom } = useSafeAreaInsets();
  return bottom ? <View style={{ height: bottom, backgroundColor: cor }} /> : null;
}
