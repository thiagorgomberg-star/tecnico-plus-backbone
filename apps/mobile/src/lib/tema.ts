import { File, Paths } from 'expo-file-system';
import * as Updates from 'expo-updates';
import { DevSettings, Platform } from 'react-native';

// Cor do app escolhida pelo técnico (Menu > Aparência). Lida de forma síncrona na abertura,
// porque os estilos são montados quando o app carrega; trocar a cor reinicia o app.
export type Tema = 'grafite' | 'azul' | 'vermelho';

export const TEMAS: Record<Tema, { rotulo: string; cabecalho: string; cabecalhoSuave: string; barra: string; primaria: string; selecionado: string }> = {
  grafite: { rotulo: 'Cinza grafite', cabecalho: '#312D2A', cabecalhoSuave: '#D5D1CD', barra: '#3A3631', primaria: '#0572CE', selecionado: '#E6F0FA' },
  azul: { rotulo: 'Azul', cabecalho: '#0B3C6E', cabecalhoSuave: '#C9DAEE', barra: '#0D477F', primaria: '#0572CE', selecionado: '#E6F0FA' },
  vermelho: { rotulo: 'Vermelho', cabecalho: '#B5121B', cabecalhoSuave: '#F6D5D7', barra: '#8E0E15', primaria: '#B5121B', selecionado: '#FBE9EA' },
};

const arquivo = () => new File(Paths.document, 'tema.txt');

export function temaAtual(): Tema {
  try {
    const t = (Platform.OS === 'web' ? globalThis.localStorage?.getItem('tema') : arquivo().exists ? arquivo().textSync() : null)?.trim();
    return t && t in TEMAS ? (t as Tema) : 'grafite';
  } catch {
    return 'grafite';
  }
}

export async function trocarTema(tema: Tema) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem('tema', tema);
    globalThis.location?.reload();
    return;
  }
  arquivo().write(tema);
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}
