import { File, Paths } from 'expo-file-system';
import * as Updates from 'expo-updates';
import { DevSettings, Platform } from 'react-native';

// Cor do app escolhida pelo técnico (Menu > Aparência). Lida de forma síncrona na abertura,
// porque os estilos são montados quando o app carrega; trocar a cor reinicia o app.
export type Tema = 'azul' | 'grafite' | 'vermelho';

// cabecalho2 é o tom mais escuro do degradê do topo (começa nele e vai até cabecalho).
export const TEMAS: Record<Tema, { rotulo: string; cabecalho: string; cabecalho2: string; cabecalhoSuave: string; barra: string; primaria: string; selecionado: string }> = {
  azul: { rotulo: 'Azul marinho', cabecalho: '#163A6B', cabecalho2: '#0F2747', cabecalhoSuave: '#C3D1E6', barra: '#1B4580', primaria: '#163A6B', selecionado: '#E8EEF7' },
  grafite: { rotulo: 'Cinza grafite', cabecalho: '#33383F', cabecalho2: '#1C1F24', cabecalhoSuave: '#CDD2D8', barra: '#3B4149', primaria: '#1F5FAF', selecionado: '#E7EFF9' },
  vermelho: { rotulo: 'Vermelho', cabecalho: '#B5121B', cabecalho2: '#7A0A11', cabecalhoSuave: '#F6D5D7', barra: '#8E0E15', primaria: '#B5121B', selecionado: '#FBE9EA' },
};

const arquivo = () => new File(Paths.document, 'tema.txt');

export function temaAtual(): Tema {
  try {
    const t = (Platform.OS === 'web' ? globalThis.localStorage?.getItem('tema') : arquivo().exists ? arquivo().textSync() : null)?.trim();
    return t && t in TEMAS ? (t as Tema) : 'azul';
  } catch {
    return 'azul';
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
