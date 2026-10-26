import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import RolarComTeclado from './RolarComTeclado';

import { cores } from '../lib/estilo';
import {
  CaixaRede, descreverRompimento, fmtMetros, kmlRompimento, lancesDoEnlace, localizarRompimento, rotuloPonto, sentidoPadrao,
} from '../lib/fusao';
import { kmlRompimentoTracado, rompimentoNoTracado, TracadoSalvo, trechoEntre } from '../lib/tracado';
import Icone from './Icone';

const numero = (t: string) => {
  const v = Number(t.replace(',', '.'));
  return t.trim() && Number.isFinite(v) ? v : null;
};

// Simulação do local de rompimento: o OTDR foi ligado neste ponto (DGO, entroncamento ou caixa) numa fibra;
// anda pelos lances (metragem do cabo, reservas) até a distância do evento e mostra onde procurar.
export default function SimularRompimento({ aberto, fechar, caixas, medicao, tracado, nomeTracado }: {
  aberto: boolean; fechar: () => void; caixas: CaixaRede[]; medicao: CaixaRede; tracado?: TracadoSalvo | null; nomeTracado?: string | null;
}) {
  const [fibra, setFibra] = useState('1');
  const [km, setKm] = useState('');
  const [excesso, setExcesso] = useState('');
  const [sentido, setSentido] = useState<'frente' | 'tras'>(sentidoPadrao(medicao));
  useEffect(() => { if (aberto) setSentido(sentidoPadrao(medicao)); }, [aberto, medicao.id]);

  const lances = useMemo(() => {
    const f = numero(fibra);
    return f ? lancesDoEnlace(caixas, medicao.id, f, sentido) : [];
  }, [caixas, medicao.id, fibra, sentido]);
  const total = lances.reduce((s, l) => s + l.reservaDe + (l.metros ?? 0), 0);
  const distancia = numero(km);
  const r = distancia != null ? localizarRompimento(lances, distancia, numero(excesso) ?? 0) : null;
  // Com o KMZ da rota o ponto segue o traçado do cabo; sem ele (ou caixa longe do traçado), linha reta entre as caixas.
  const noTracado = r && tracado ? rompimentoNoTracado(r, lances, tracado.caminho, medicao) : null;
  const ponto = noTracado ? { lat: noTracado.lat, lng: noTracado.lng } : r && r.tipo !== 'sem_medida' && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;

  async function compartilhar() {
    if (!r || distancia == null) return;
    const titulo = `Rompimento a ${km} km de ${medicao.identificacao}`;
    const kml = noTracado && tracado
      ? kmlRompimentoTracado(titulo, `${descreverRompimento(r)}. Medido em ${medicao.identificacao}${nomeTracado ? ` · traçado ${nomeTracado}` : ''}.`, noTracado,
        medicao.latitude != null && medicao.longitude != null ? { nome: medicao.identificacao, lat: medicao.latitude, lng: medicao.longitude } : null,
        noTracado.sMedicao != null ? trechoEntre(tracado.caminho, noTracado.sMedicao, noTracado.sRompimento) : [])
      : kmlRompimento(r, medicao, distancia, titulo);
    if (!kml) return Alert.alert('Sem localização', 'Falta o GPS dos pontos para marcar no mapa.');
    try {
      const arq = new File(Paths.cache, `rompimento-${medicao.identificacao}-${km.replace(',', '.')}km.kml`);
      if (arq.exists) arq.delete();
      arq.create();
      arq.write(kml);
      await Sharing.shareAsync(arq.uri, { mimeType: 'application/vnd.google-earth.kml+xml', dialogTitle: 'Rompimento (KML)' });
    } catch {
      Alert.alert('Não foi possível gerar o arquivo');
    }
  }

  return (
    <Modal visible={aberto} animationType="slide" onRequestClose={fechar}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12}><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topoTitulo}>Localizar rompimento (OTDR)</Text>
            <Text style={s.topoSub}>Medição em {medicao.identificacao} · {rotuloPonto(medicao.tipo ?? 'emenda', medicao.swap)}</Text>
          </View>
        </View>
        <RolarComTeclado contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={s.cartao}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 90 }}>
                <Text style={s.rotulo}>Fibra</Text>
                <TextInput style={s.campo} keyboardType="number-pad" value={fibra} onChangeText={setFibra} placeholder="1" placeholderTextColor={cores.apagado} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rotulo}>Distância do evento no OTDR (km)</Text>
                <TextInput style={s.campo} keyboardType="decimal-pad" value={km} onChangeText={setKm} placeholder="Ex.: 1,100" placeholderTextColor={cores.apagado} />
              </View>
            </View>
            <Text style={s.rotulo}>Para que lado o OTDR mediu?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {([['frente', 'Para frente (saídas)'], ['tras', 'Para trás (de onde vem)']] as const).map(([v, t]) => (
                <Pressable key={v} style={[s.opcao, sentido === v && s.opcaoAtiva]} onPress={() => setSentido(v)}>
                  <Text style={[s.opcaoTexto, sentido === v && { color: '#fff' }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.rotulo}>Excesso de fibra do cabo (%, opcional)</Text>
            <TextInput style={s.campo} keyboardType="decimal-pad" value={excesso} onChangeText={setExcesso} placeholder="0 (a distância do OTDR = metros de cabo)" placeholderTextColor={cores.apagado} />
          </View>

          <Text style={s.secao}>CAMINHO DA FIBRA {lances.length ? `· ${fmtMetros(total)}` : ''}</Text>
          {lances.length === 0 ? (
            <Text style={s.suave}>{sentido === 'frente' ? 'Nenhum ponto cadastrado depois deste nessa fibra.' : 'Nenhum ponto cadastrado antes deste nessa fibra.'}</Text>
          ) : lances.map((l, i) => (
            <View key={i} style={s.lance}>
              <Text style={s.lanceTitulo}>{l.de.identificacao} → {l.para.identificacao}</Text>
              <Text style={s.suave}>
                {l.metros == null ? 'Sem metragem nem GPS' : `${fmtMetros(l.metros)} ${l.fonte === 'cabo' ? `pela metragem do cabo (${l.marcaDe} → ${l.marcaPara})` : 'estimado pelo GPS'}`}
                {l.reservaDe ? ` · reserva em ${l.de.identificacao}: ${l.reservaDe} m` : ''}
                {l.reservas.length ? ` · ${l.reservas.length} reserva(s) no caminho: ${l.reservas.map((x) => `${x.metros} m${x.obs ? ` (${x.obs})` : ''}`).join(', ')}` : ''}
              </Text>
            </View>
          ))}

          {r ? (
            <View style={[s.resultado, r.tipo === 'sem_medida' && { borderColor: cores.alerta }]}>
              <Text style={s.resultadoTitulo}>{r.tipo === 'sem_medida' ? 'Falta dado para calcular' : 'Possível rompimento'}</Text>
              <Text style={s.resultadoTexto}>{descreverRompimento(r)}</Text>
              <Text style={s.suave}>Medido em {medicao.identificacao}, fibra {fibra}, {km} km{numero(excesso) ? `, excesso ${excesso}%` : ''}.</Text>
              {r.tipo !== 'sem_medida' ? (
                <Text style={[s.suave, { marginTop: 4, color: noTracado ? cores.sucesso : cores.alerta }]}>
                  {noTracado ? `Posição sobre o traçado do KMZ${nomeTracado ? ` (${nomeTracado})` : ''}.` : tracado ? 'Caixas longe do traçado do KMZ: posição em linha reta entre as caixas.' : 'Sem KMZ: posição em linha reta entre as caixas.'}
                </Text>
              ) : null}
              {ponto ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable style={[s.botao, { flex: 1 }]} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${ponto.lat},${ponto.lng}`)}>
                    <Icone nome="map-marker-radius-outline" tamanho={18} cor="#fff" />
                    <Text style={s.botaoTexto}>Ver no mapa</Text>
                  </Pressable>
                  <Pressable style={[s.botao, { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: cores.primaria }]} onPress={compartilhar}>
                    <Icone nome="google-earth" tamanho={18} cor={cores.primaria} />
                    <Text style={[s.botaoTexto, { color: cores.primaria }]}>KML (Earth)</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={[s.suave, { marginTop: 12 }]}>
            Quanto mais pontos com a metragem do cabo (caixas e postes da vistoria) e reservas anotadas, mais perto fica o resultado.
          </Text>
        </RolarComTeclado>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  topoTitulo: { color: '#fff', fontSize: 18, fontWeight: '800' },
  topoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  cartao: { backgroundColor: cores.cartao, borderRadius: 14, padding: 12 },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.texto2, marginTop: 10 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 10, padding: 10, fontSize: 16, color: cores.texto, backgroundColor: '#fff', marginTop: 4 },
  opcao: { flex: 1, borderWidth: 1.5, borderColor: cores.borda, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  opcaoAtiva: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  opcaoTexto: { fontSize: 13.5, fontWeight: '700', color: cores.texto },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  suave: { fontSize: 12.5, color: cores.suave },
  lance: { backgroundColor: cores.cartao, borderRadius: 10, padding: 10, marginBottom: 6 },
  lanceTitulo: { fontSize: 14, fontWeight: '800', color: cores.texto },
  resultado: { marginTop: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 2, borderColor: cores.perigo },
  resultadoTitulo: { fontSize: 13, fontWeight: '800', color: cores.perigo, letterSpacing: 0.3 },
  resultadoTexto: { fontSize: 15.5, fontWeight: '700', color: cores.texto, marginTop: 4, marginBottom: 6 },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, backgroundColor: cores.primaria },
  botaoTexto: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
