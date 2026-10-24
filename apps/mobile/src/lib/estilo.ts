import { StyleSheet } from 'react-native';

// Paleta inspirada no Oracle Field Service: cabeçalho escuro, azul de ação e cor por status.
export const cores = {
  fundo: '#F1EFED',
  cartao: '#FFFFFF',
  texto: '#161513',
  suave: '#6F6964',
  primaria: '#0572CE',
  cabecalho: '#312D2A',
  cabecalhoTexto: '#FFFFFF',
  perigo: '#C74634',
  alerta: '#E08A1E',
  sucesso: '#508223',
  borda: '#E4E1DD',
  cabecalhoSuave: '#D5D1CD',
  barra: '#3A3631',
  selecionado: '#E6F0FA',
};

export const corDoStatus: Record<string, string> = {
  enviada: '#0572CE',
  aceita: '#227E9E',
  em_execucao: '#508223',
  pausada: '#E08A1E',
  concluida: '#7B5EA7',
  devolvida: '#C74634',
  baixada: '#6F6964',
  cancelada: '#A39E99',
  rascunho: '#A39E99',
};

export const estilo = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  cartao: {
    backgroundColor: cores.cartao,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  titulo: { fontSize: 18, fontWeight: '600', color: cores.texto },
  texto: { fontSize: 15, color: cores.texto },
  suave: { fontSize: 13, color: cores.suave },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: cores.cartao,
    marginTop: 8,
  },
  botao: {
    backgroundColor: cores.primaria,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  botaoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
