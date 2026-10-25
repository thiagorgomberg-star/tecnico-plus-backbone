import { StyleSheet } from 'react-native';

import { TEMAS, temaAtual } from './tema';

const tema = TEMAS[temaAtual()];

// Paleta do app: topo em degradê na cor do tema, cartões brancos flutuantes, cor de ação e cor por status.
export const cores = {
  fundo: '#EEF1F5',
  cartao: '#FFFFFF',
  texto: '#101828',
  suave: '#667085',
  apagado: '#98A2B3',
  cabecalho2: tema.cabecalho2,
  primaria: tema.primaria,
  cabecalho: tema.cabecalho,
  cabecalhoTexto: '#FFFFFF',
  perigo: '#C62828',
  alerta: '#C77700',
  sucesso: '#2E7D32',
  borda: '#E4E7EC',
  cabecalhoSuave: tema.cabecalhoSuave,
  barra: tema.barra,
  selecionado: tema.selecionado,
  linha: '#EEF1F5',
  texto2: '#344054',
};

// Sombra suave dos cartões (Android usa elevation; web/iOS usam shadow*).
export const sombra = {
  shadowColor: '#101828',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

// Fundo claro do selo de cada cor (status, SLA).
export const fundoDe = (cor: string) => `${cor}1F`;

export const corDoStatus: Record<string, string> = {
  enviada: '#1F6FD1',
  aceita: '#0E7C86',
  em_execucao: '#2E7D32',
  pausada: '#C77700',
  concluida: '#6E56CF',
  devolvida: '#C62828',
  baixada: '#667085',
  cancelada: '#98A2B3',
  rascunho: '#98A2B3',
};

export const estilo = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  cartao: {
    backgroundColor: cores.cartao,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    ...sombra,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto },
  texto: { fontSize: 15, color: cores.texto },
  suave: { fontSize: 13, color: cores.suave },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.cartao,
    marginTop: 8,
  },
  botao: {
    backgroundColor: cores.primaria,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  botaoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
