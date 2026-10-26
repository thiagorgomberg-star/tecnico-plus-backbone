import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores } from '../lib/estilo';
import {
  aoMudarFila, definirFotosSoWifi, descartarRecusado, descreverItem, ehFoto, erroSincronizacao, fotosSoWifi, ItemFila, itensPendentes, itensRecusados, Recusado,
  reenviarRecusado, segurandoFotos, sincronizar,
} from '../lib/fila';

const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const dataDoItem = (i: ItemFila) => (i.tipo === 'foto' ? i.tiradaEm : undefined);

// O que ainda não subiu para o servidor e o que o servidor recusou: o técnico vê, reenvia ou descarta.
export default function FilaEnvio({ voltar }: { voltar: () => void }) {
  const [pendentes, setPendentes] = useState<ItemFila[] | null>(null);
  const [recusados, setRecusados] = useState<Recusado[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [soWifi, setSoWifi] = useState(false);
  const [segurando, setSegurando] = useState(false);

  useEffect(() => {
    const ler = async () => {
      setPendentes(await itensPendentes()); setRecusados(await itensRecusados());
      setSoWifi(await fotosSoWifi()); setSegurando(await segurandoFotos());
    };
    ler();
    return aoMudarFila(ler);
  }, []);

  async function enviarAgora() {
    setEnviando(true);
    try { await sincronizar(); } finally {
      setEnviando(false);
      const erro = erroSincronizacao();
      if (erro && (await itensPendentes()).length) Alert.alert('Ainda não foi', `Sem conexão com o servidor agora (${erro}). O app tenta de novo sozinho a cada 30 s.`);
    }
  }

  function descartar(i: number) {
    Alert.alert('Descartar este registro?', 'Ele não vai mais para o servidor. Não dá para desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => Alert.alert('Confirmar descarte', 'Tem certeza?', [
        { text: 'Não', style: 'cancel' }, { text: 'Sim, descartar', style: 'destructive', onPress: () => descartarRecusado(i) },
      ]) },
    ]);
  }

  // Agrupa itens iguais em sequência (ex.: 120 pontos de GPS viram uma linha só).
  const grupos: { texto: string; qtd: number; data?: string }[] = [];
  for (const i of pendentes ?? []) {
    const texto = descreverItem(i);
    const ult = grupos[grupos.length - 1];
    if (ult && ult.texto === texto) ult.qtd++;
    else grupos.push({ texto, qtd: 1, data: dataDoItem(i) });
  }

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Envios pendentes" subtitulo="O que ainda não chegou ao servidor" voltar={voltar} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Pressable style={[s.botao, enviando && { opacity: 0.6 }]} onPress={enviarAgora} disabled={enviando}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Icone nome="cloud-upload-outline" tamanho={20} cor="#fff" />}
          <Text style={s.botaoTexto}>Enviar agora</Text>
        </Pressable>

        <View style={[s.item, { marginTop: 12 }]}>
          <Icone nome="wifi" tamanho={20} cor={cores.primaria} />
          <View style={{ flex: 1 }}>
            <Text style={s.texto}>Enviar fotos só no Wi-Fi</Text>
            <Text style={s.suave}>Economiza o plano de dados. GPS e O.S. continuam indo pelo 4G.</Text>
          </View>
          <Switch value={soWifi} onValueChange={(v) => { setSoWifi(v); definirFotosSoWifi(v); }} accessibilityLabel="Enviar fotos só no Wi-Fi" />
        </View>
        {segurando && (pendentes ?? []).some(ehFoto) ? (
          <Text style={[s.suave, { marginTop: 6, color: cores.alerta }]}>
            {(pendentes ?? []).filter(ehFoto).length} foto(s) esperando Wi-Fi.
          </Text>
        ) : null}

        <Text style={s.secao}>AGUARDANDO ENVIO ({pendentes?.length ?? 0})</Text>
        {pendentes == null ? <ActivityIndicator color={cores.primaria} /> : grupos.length === 0 ? (
          <View style={s.vazio}><Icone nome="check-circle-outline" tamanho={22} cor={cores.sucesso} /><Text style={s.texto}>Tudo enviado.</Text></View>
        ) : grupos.map((g, i) => (
          <View key={i} style={s.item}>
            <Icone nome="clock-outline" tamanho={20} cor={cores.alerta} />
            <View style={{ flex: 1 }}>
              <Text style={s.texto}>{g.texto}{g.qtd > 1 ? ` (${g.qtd})` : ''}</Text>
              {g.data ? <Text style={s.suave}>{quando(g.data)}</Text> : null}
            </View>
          </View>
        ))}
        {pendentes?.length && erroSincronizacao() ? <Text style={[s.suave, { marginTop: 6 }]}>Último erro: {erroSincronizacao()}</Text> : null}

        {recusados.length ? (
          <>
            <Text style={[s.secao, { color: cores.perigo }]}>RECUSADOS PELO SERVIDOR ({recusados.length})</Text>
            {recusados.map((r, i) => (
              <View key={i} style={[s.item, { alignItems: 'flex-start' }]}>
                <Icone nome="alert-circle-outline" tamanho={20} cor={cores.perigo} />
                <View style={{ flex: 1 }}>
                  <Text style={s.texto}>{descreverItem(r.item)}</Text>
                  <Text style={s.suave}>{quando(r.em)} · {r.erro}</Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                    <Pressable onPress={() => reenviarRecusado(i)}><Text style={s.acao}>Reenviar</Text></Pressable>
                    <Pressable onPress={() => descartar(i)}><Text style={[s.acao, { color: cores.perigo }]}>Descartar</Text></Pressable>
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: cores.primaria },
  botaoTexto: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginTop: 20, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: 12, padding: 12, marginTop: 8 },
  vazio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: 12, padding: 12, marginTop: 8 },
  texto: { fontSize: 14.5, fontWeight: '700', color: cores.texto },
  suave: { fontSize: 12.5, color: cores.suave, marginTop: 2 },
  acao: { color: cores.primaria, fontWeight: '800' },
});
