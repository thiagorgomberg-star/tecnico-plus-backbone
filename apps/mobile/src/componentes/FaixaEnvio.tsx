import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { aoMudarFila, ehFoto, erroSincronizacao, itensPendentes, segurandoFotos } from '../lib/fila';
import Icone from './Icone';

// Faixa fixa no topo: o técnico sabe se o que registrou já chegou ao servidor ou está guardado no celular esperando sinal.
// Os pontos de GPS (que entram a cada minuto) não contam, senão a faixa piscaria o tempo todo.
export default function FaixaEnvio({ abrirFila }: { abrirFila: () => void }) {
  const [qtd, setQtd] = useState(0);
  const [fotosWifi, setFotosWifi] = useState(0);
  const [semSinal, setSemSinal] = useState(false);
  const [tudoEnviado, setTudoEnviado] = useState(false);
  const anterior = useRef(0);

  useEffect(() => {
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const ler = async () => {
      const itens = (await itensPendentes()).filter((i) => !('tabela' in i && i.tabela === 'posicoes_gps'));
      const segurando = await segurandoFotos();
      const esperandoWifi = segurando ? itens.filter(ehFoto).length : 0;
      const n = itens.length - esperandoWifi;
      setQtd(n);
      setFotosWifi(esperandoWifi);
      setSemSinal(!!erroSincronizacao());
      if (anterior.current > 0 && n === 0) {
        setTudoEnviado(true);
        clearTimeout(relogio);
        relogio = setTimeout(() => setTudoEnviado(false), 4000);
      }
      anterior.current = n;
    };
    ler();
    const parar = aoMudarFila(ler);
    return () => { parar(); clearTimeout(relogio); };
  }, []);

  if (qtd > 0) {
    return (
      <Pressable style={[s.faixa, { backgroundColor: semSinal ? '#FFF4E5' : '#E8F1FB' }]} onPress={abrirFila}>
        <Icone nome={semSinal ? 'wifi-off' : 'cloud-upload-outline'} tamanho={18} cor={semSinal ? '#7A4B00' : '#0B4F8A'} />
        <Text style={[s.texto, { color: semSinal ? '#7A4B00' : '#0B4F8A' }]}>
          {semSinal
            ? `Sem sinal: ${qtd} registro(s) guardado(s) no celular. Vão sozinhos quando o sinal voltar.`
            : `Enviando ${qtd} registro(s)...`}
        </Text>
      </Pressable>
    );
  }
  if (fotosWifi > 0) {
    return (
      <Pressable style={[s.faixa, { backgroundColor: '#E8F1FB' }]} onPress={abrirFila}>
        <Icone nome="wifi" tamanho={18} cor="#0B4F8A" />
        <Text style={[s.texto, { color: '#0B4F8A' }]}>{fotosWifi} foto(s) esperando Wi-Fi para enviar.</Text>
      </Pressable>
    );
  }
  if (tudoEnviado) {
    return (
      <Pressable style={[s.faixa, { backgroundColor: '#E7F6EC' }]} onPress={abrirFila}>
        <Icone nome="check-circle-outline" tamanho={18} cor="#1E7B3C" />
        <Text style={[s.texto, { color: '#1E7B3C' }]}>Tudo enviado ✓</Text>
      </Pressable>
    );
  }
  return null;
}

const s = StyleSheet.create({
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  texto: { flex: 1, fontSize: 13.5, fontWeight: '600' },
});
