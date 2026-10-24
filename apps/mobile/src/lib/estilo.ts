import { StyleSheet } from 'react-native';

export const cores = {
  fundo: '#F4F6F8',
  cartao: '#FFFFFF',
  texto: '#1B1F24',
  suave: '#5F6B7A',
  primaria: '#0B5CAD',
  perigo: '#C62828',
  sucesso: '#2E7D32',
  borda: '#DDE2E8',
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
