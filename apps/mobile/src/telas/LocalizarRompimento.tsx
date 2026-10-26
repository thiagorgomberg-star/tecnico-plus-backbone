import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import SimularRompimento from '../componentes/SimularRompimento';
import { caixasDaRede } from '../lib/caixas';
import { cores } from '../lib/estilo';
import { CaixaRede, fmtMetros, rotuloPonto } from '../lib/fusao';
import { inserirKmz, KmzRota, kmzDaRota, RotaSimples, rotasParaRompimento, tracadoDoKmz } from '../lib/kmzRotas';
import { TracadoSalvo } from '../lib/tracado';

// Ferramenta à parte (como o analisador de curvas): 1) rota, 2) KMZ da rota (inserir o atual ou um já usado),
// 3) onde o OTDR foi ligado. O rompimento é posto sobre o traçado do KMZ usando a metragem do cabo das caixas.
export default function LocalizarRompimento({ voltar }: { voltar: () => void }) {
  const [rotas, setRotas] = useState<RotaSimples[] | null>(null);
  const [rota, setRota] = useState<RotaSimples | null>(null);
  const [kmzs, setKmzs] = useState<KmzRota[] | null>(null);
  const [kmz, setKmz] = useState<KmzRota | null>(null);
  const [semKmz, setSemKmz] = useState(false);
  const [tracado, setTracado] = useState<TracadoSalvo | null>(null);
  const [lendo, setLendo] = useState(false);
  const [caixas, setCaixas] = useState<CaixaRede[] | null>(null);
  const [busca, setBusca] = useState('');
  const [medicao, setMedicao] = useState<CaixaRede | null>(null);

  useEffect(() => {
    rotasParaRompimento(setRotas).catch(() => setRotas((v) => v ?? []));
    let vivo = true;
    caixasDaRede((c) => vivo && setCaixas(c)).then((c) => vivo && setCaixas(c)).catch(() => vivo && setCaixas((v) => v ?? []));
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    setKmzs(null); setKmz(null); setTracado(null); setSemKmz(false);
    if (rota) kmzDaRota(rota.id, setKmzs).catch(() => setKmzs((v) => v ?? []));
  }, [rota?.id]);

  async function usarKmz(k: KmzRota) {
    setLendo(true);
    try {
      const t = await tracadoDoKmz(k.id);
      if (!t) return Alert.alert('Sem sinal', 'Este KMZ ainda não foi baixado neste celular. Tente com internet.');
      setKmz(k); setTracado(t); setSemKmz(false);
    } finally { setLendo(false); }
  }

  async function inserir() {
    if (!rota) return;
    setLendo(true);
    try {
      const k = await inserirKmz(rota.id);
      if (!k) return;
      setKmzs((v) => [k, ...(v ?? [])]);
      await usarKmz(k);
    } catch (e) {
      Alert.alert('Não foi possível ler o KMZ', (e as Error).message);
    } finally { setLendo(false); }
  }

  // Pontos da rota escolhida (pela O.S. em que foram lançados); DGO e entroncamento primeiro.
  const daRota = useMemo(() => (caixas ?? []).filter((c) => rota && c.trecho === rota.trecho), [caixas, rota]);
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const ponta = (c: CaixaRede) => Number(c.tipo === 'dgo' || c.tipo === 'entroncamento');
    return (daRota.length ? daRota : caixas ?? []).filter((c) => !termo || c.identificacao.toLowerCase().includes(termo))
      .sort((a, b) => ponta(b) - ponta(a) || a.identificacao.localeCompare(b.identificacao));
  }, [daRota, caixas, busca]);
  const pronto = !!rota && (!!tracado || semKmz);

  const passo = (n: number, titulo: string, feito: string | null, voltarPara?: () => void) => (
    <View style={s.passo}>
      <View style={[s.numero, feito ? { backgroundColor: cores.sucesso } : null]}><Text style={s.numeroTexto}>{feito ? '✓' : n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.passoTitulo}>{titulo}</Text>
        {feito ? <Text style={s.ajuda}>{feito}</Text> : null}
      </View>
      {feito && voltarPara ? <Pressable onPress={voltarPara} hitSlop={10}><Text style={s.trocar}>Trocar</Text></Pressable> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Localizar rompimento" subtitulo="Rota, KMZ e distância do OTDR" voltar={voltar} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {passo(1, 'Rota', rota ? rota.trecho : null, () => setRota(null))}
        {!rota ? (rotas == null ? <ActivityIndicator color={cores.primaria} /> : rotas.length === 0 ? (
          <Text style={s.ajuda}>Nenhuma rota cadastrada no painel.</Text>
        ) : rotas.map((r) => (
          <Pressable key={r.id} style={s.item} onPress={() => setRota(r)}>
            <Icone nome="map-outline" tamanho={22} cor={cores.primaria} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitulo}>{r.trecho}</Text>
              {r.descricao ? <Text style={s.ajuda}>{r.descricao}</Text> : null}
            </View>
            <Icone nome="chevron-right" tamanho={22} cor={cores.apagado} />
          </Pressable>
        ))) : null}

        {rota ? passo(2, 'KMZ da rota', kmz ? `${kmz.nome_arquivo}${kmz.extensao_m ? ` · ${fmtMetros(kmz.extensao_m)} de traçado` : ''}` : semKmz ? 'Sem KMZ: linha reta entre as caixas' : null,
          () => { setKmz(null); setTracado(null); setSemKmz(false); setMedicao(null); }) : null}
        {rota && !pronto ? (
          <>
            <Pressable style={[s.botao, lendo && { opacity: 0.6 }]} onPress={inserir} disabled={lendo}>
              {lendo ? <ActivityIndicator color="#fff" /> : <Icone nome="file-upload-outline" tamanho={20} cor="#fff" />}
              <Text style={s.botaoTexto}>Inserir o KMZ atual</Text>
            </Pressable>
            <Text style={s.secao}>OU ESCOLHA UM KMZ JÁ USADO NESTA ROTA</Text>
            {kmzs == null ? <ActivityIndicator color={cores.primaria} /> : kmzs.length === 0 ? (
              <Text style={s.ajuda}>Nenhum KMZ guardado nesta rota ainda.</Text>
            ) : kmzs.map((k) => (
              <Pressable key={k.id} style={s.item} onPress={() => usarKmz(k)} disabled={lendo}>
                <Icone nome="google-earth" tamanho={22} cor={cores.primaria} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitulo} numberOfLines={1}>{k.nome_arquivo}</Text>
                  <Text style={s.ajuda}>{new Date(k.criado_em).toLocaleDateString('pt-BR')}{k.extensao_m ? ` · ${fmtMetros(k.extensao_m)}` : ''}{k.local ? ' · aguardando envio' : ''}</Text>
                </View>
                <Icone nome="chevron-right" tamanho={22} cor={cores.apagado} />
              </Pressable>
            ))}
            <Pressable onPress={() => setSemKmz(true)} style={{ marginTop: 12 }}>
              <Text style={s.trocar}>Continuar sem KMZ (linha reta entre as caixas)</Text>
            </Pressable>
          </>
        ) : null}

        {pronto ? passo(3, 'Onde o OTDR foi ligado?', null) : null}
        {pronto ? (
          <>
            {!daRota.length ? <Text style={s.ajuda}>Nenhuma caixa lançada nesta rota ainda; mostrando todas.</Text> : null}
            <Text style={s.rotulo}>Buscar ponto</Text>
            <TextInput style={s.campo} value={busca} onChangeText={setBusca} placeholder="Ex.: DGO-BKB-0001" placeholderTextColor={cores.apagado} autoCapitalize="characters" />
            {caixas == null ? <ActivityIndicator color={cores.primaria} /> : lista.map((c) => (
              <Pressable key={c.id} style={s.item} onPress={() => setMedicao(c)}>
                <Icone nome={c.tipo === 'dgo' ? 'server-network' : 'package-variant'} tamanho={22} cor={cores.primaria} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitulo}>{c.identificacao}</Text>
                  <Text style={s.ajuda}>{rotuloPonto(c.tipo ?? 'emenda', c.swap)}</Text>
                </View>
                <Icone nome="chevron-right" tamanho={22} cor={cores.apagado} />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
      {medicao && caixas ? (
        <SimularRompimento aberto fechar={() => setMedicao(null)} medicao={medicao} caixas={caixas}
          tracado={tracado} nomeTracado={kmz ? `${rota?.trecho} · ${kmz.nome_arquivo}` : null} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  ajuda: { fontSize: 13, color: cores.suave },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.texto2, marginTop: 12 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 10, padding: 10, fontSize: 16, color: cores.texto, backgroundColor: '#fff', marginTop: 4, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: 12, padding: 12, marginTop: 8 },
  itemTitulo: { fontSize: 15, fontWeight: '800', color: cores.texto },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 4 },
  numero: { width: 28, height: 28, borderRadius: 14, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#fff', fontWeight: '800' },
  passoTitulo: { fontSize: 16, fontWeight: '800', color: cores.texto },
  trocar: { color: cores.primaria, fontWeight: '700' },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginTop: 16 },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: cores.primaria, marginTop: 8 },
  botaoTexto: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});
