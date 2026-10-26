import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import Icone, { NomeIcone } from './Icone';
import MargemInferior from './MargemInferior';

export const CHAVE_GUIA = 'guia-visto-v1';

const PAGINAS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: 'play-circle-outline', titulo: 'Comece o dia', texto: 'Na tela Início, toque em Iniciar expediente. O cartão azul mostra a sua próxima O.S.: Rota leva até o local e Abrir entra na O.S.' },
  { icone: 'format-list-checks', titulo: 'Siga o passo a passo', texto: 'Dentro da O.S., o botão azul mostra sempre o próximo passo: fotos do antes, lançar o que foi feito, fotos do depois e assinar. Se faltar algo, o app avisa.' },
  { icone: 'cloud-upload-outline', titulo: 'Funciona sem sinal', texto: 'Sem internet, tudo fica salvo no celular. A faixa no topo mostra o que está esperando e envia sozinho quando o sinal voltar. Não desinstale o app com envios pendentes.' },
  { icone: 'help-circle-outline', titulo: 'Dúvida? Toque no "?"', texto: 'O botão Ajuda no topo explica a tela em que você está. Este guia fica no Menu, em Guia rápido.' },
];

export default function GuiaRapido({ fechar }: { fechar: () => void }) {
  const [pagina, setPagina] = useState(0);
  const p = PAGINAS[pagina];
  const ultima = pagina === PAGINAS.length - 1;
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <View style={s.fundo}>
        <Pressable onPress={fechar} hitSlop={12} style={s.pular}><Text style={s.pularTexto}>Pular</Text></Pressable>
        <View style={s.icone}><Icone nome={p.icone} tamanho={52} cor={cores.primaria} /></View>
        <Text style={s.titulo}>{p.titulo}</Text>
        <Text style={s.texto}>{p.texto}</Text>
        <View style={s.pontos}>
          {PAGINAS.map((_, i) => <View key={i} style={[s.ponto, i === pagina && s.pontoAtivo]} />)}
        </View>
        <View style={s.botoes}>
          {pagina > 0 ? (
            <Pressable style={[s.botao, s.botaoSecundario]} onPress={() => setPagina(pagina - 1)}>
              <Icone nome="arrow-left" tamanho={20} cor={cores.texto} /><Text style={[s.botaoTexto, { color: cores.texto }]}>Voltar</Text>
            </Pressable>
          ) : null}
          <Pressable style={s.botao} onPress={() => (ultima ? fechar() : setPagina(pagina + 1))}>
            <Text style={s.botaoTexto}>{ultima ? 'Começar' : 'Próximo'}</Text>
            <Icone nome={ultima ? 'check' : 'arrow-right'} tamanho={20} cor="#fff" />
          </Pressable>
        </View>
      </View>
      <MargemInferior cor={cores.fundo} />
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: cores.fundo, padding: 24, justifyContent: 'center' },
  pular: { position: 'absolute', top: 48, right: 24 },
  pularTexto: { fontSize: 16, color: cores.suave, fontWeight: '600' },
  icone: { alignSelf: 'center', width: 104, height: 104, borderRadius: 52, backgroundColor: cores.cartao, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 24, fontWeight: '800', color: cores.texto, textAlign: 'center', marginTop: 20 },
  texto: { fontSize: 17, lineHeight: 25, color: cores.texto2, textAlign: 'center', marginTop: 12 },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 28 },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.borda },
  pontoAtivo: { width: 22, backgroundColor: cores.primaria },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 28 },
  botao: { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: cores.primaria, borderRadius: 14, height: 58, alignItems: 'center', justifyContent: 'center' },
  botaoSecundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
