import { File } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  Comparacao, compararAntesDepois, compararBidirecional, compararFibras, fimDaFibra, mesmoSentido, Momento, ROTULO_MOMENTO, ROTULO_SENTIDO, Sentido, tracoParaComparar,
} from '../lib/comparaSor';
import { cores, sombra } from '../lib/estilo';
import { compartilharComparativo } from '../lib/relatorioCurva';
import { curvaCompleta, km, lerDbm, lerSor, Nivel, rotuloOnda, Sor, textoPotencia } from '../lib/sor';
import Icone from './Icone';
import MargemInferior from './MargemInferior';

export type CurvaMarcada = { chave: string; nome: string; uri: string; fibra: string; sentido: Sentido | ''; momento: Momento; tx?: string; rx?: string };
type Tipo = 'bidirecional' | 'antesDepois' | 'fibras';

const COR: Record<Nivel, string> = { ok: '#1E9E4A', atencao: '#D99A00', critico: '#D0453B' };
const CORES_CURVA = ['#163A6B', '#E07B00'];
const fmt = (n: number | null, casas = 2) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));

// Comparativo no celular (offline): A → B × B → A, antes × depois da mesma fibra, ou duas fibras do mesmo cabo no mesmo sentido.
export default function ComparaCurvas({ curvas, aoMudar, analisarSozinha, fechar }: {
  curvas: CurvaMarcada[] | null;
  aoMudar: (chave: string, m: Partial<Pick<CurvaMarcada, 'fibra' | 'sentido' | 'momento' | 'tx' | 'rx'>>) => void;
  analisarSozinha: (c: CurvaMarcada) => void;
  fechar: () => void;
}) {
  const lista = curvas ?? [];
  const { width } = useWindowDimensions();
  const [lidas, setLidas] = useState<Record<string, Sor | string>>({});
  const [modo, setModo] = useState<'completa' | 'otdr'>('completa');
  const [fibra, setFibra] = useState('');
  const [tipo, setTipoBruto] = useState<Tipo>('bidirecional');
  // O tipo é sugerido pelas curvas (sentidos marcados ou, sem marca, pelo traço) até a pessoa escolher.
  const tipoEscolhido = useRef(false);
  const setTipo = (t: Tipo) => { tipoEscolhido.current = true; setTipoBruto(t); };
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    lista.forEach(async (c) => {
      if (lidas[c.chave]) return;
      let r: Sor | string;
      try { r = lerSor(await new File(c.uri).bytes()); } catch { r = 'Arquivo .SOR inválido.'; }
      setLidas((l) => ({ ...l, [c.chave]: r }));
      if (typeof r !== 'string' && !c.fibra && r.fibra) aoMudar(c.chave, { fibra: r.fibra });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.map((c) => c.chave).join()]);

  const fibras = [...new Set(lista.map((c) => c.fibra.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const visiveis = lista.filter((c) => (tipo === 'fibras' || !fibra || c.fibra.trim() === fibra) && typeof lidas[c.chave] === 'object');
  const sor = (k: string) => { const s = lidas[k]; return s && typeof s !== 'string' ? (modo === 'completa' ? curvaCompleta(s) : s) : null; };

  useEffect(() => {
    if (tipoEscolhido.current) return;
    const v = lista.filter((c) => typeof lidas[c.chave] === 'object');
    if (v.length < 2) return;
    const [a, b] = v, sa = lidas[a.chave] as Sor, sb = lidas[b.chave] as Sor;
    const marcados = a.sentido && b.sentido;
    const igual = marcados ? a.sentido === b.sentido : mesmoSentido(sa, sb);
    if (!igual) return setTipoBruto('bidirecional');
    const fibrasDiferentes = a.fibra.trim() && b.fibra.trim() && a.fibra.trim() !== b.fibra.trim();
    setTipoBruto(fibrasDiferentes || (!a.momento && !b.momento && !(a.fibra.trim() && a.fibra.trim() === b.fibra.trim())) ? 'fibras' : 'antesDepois');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(lidas).length, lista.map((c) => `${c.chave}${c.sentido}${c.momento}${c.fibra}`).join()]);

  useEffect(() => {
    if (tipo === 'bidirecional') {
      setC1(visiveis.find((c) => c.sentido === 'AB')?.chave ?? visiveis[0]?.chave ?? '');
      setC2(visiveis.find((c) => c.sentido === 'BA')?.chave ?? visiveis[1]?.chave ?? '');
    } else if (tipo === 'fibras') {
      const a = visiveis[0];
      setC1(a?.chave ?? '');
      setC2((visiveis.find((c) => c.chave !== a?.chave && c.fibra.trim() !== a?.fibra.trim() && (!a?.sentido || !c.sentido || c.sentido === a.sentido))
        ?? visiveis.find((c) => c.chave !== a?.chave))?.chave ?? '');
    } else {
      const antes = visiveis.find((c) => c.momento === 'antes') ?? visiveis[0];
      setC1(antes?.chave ?? '');
      setC2(visiveis.find((c) => c.momento === 'depois' && c.chave !== antes?.chave && (!antes?.sentido || c.sentido === antes.sentido))?.chave
        ?? visiveis.find((c) => c.chave !== antes?.chave)?.chave ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, fibra, Object.keys(lidas).length, lista.map((c) => `${c.chave}${c.sentido}${c.momento}`).join()]);

  const s1 = c1 ? sor(c1) : null, s2 = c2 && c2 !== c1 ? sor(c2) : null;
  const curva = (k: string) => lista.find((c) => c.chave === k);
  const nomeFibra = (k: string, n: number) => `Fibra ${curva(k)?.fibra.trim() || n}`;
  const nomes: [string, string] = tipo === 'bidirecional' ? ['A → B', 'B → A'] : tipo === 'fibras'
    ? (() => { const a = nomeFibra(c1, 1), b = nomeFibra(c2, 2); return a === b ? ['Fibra 1', 'Fibra 2'] : [a, b]; })() : ['Antes', 'Depois'];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pareceMesmo = useMemo(() => !!(s1 && s2 && mesmoSentido(s1, s2)), [c1, c2, modo, lidas[c1], lidas[c2]]);
  const comp: Comparacao | null = useMemo(
    () => (s1 && s2 ? (tipo === 'bidirecional' ? compararBidirecional(s1, s2) : tipo === 'fibras' ? compararFibras(s1, s2, nomes) : compararAntesDepois(s1, s2)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c1, c2, tipo, modo, lidas[c1], lidas[c2]],
  );

  const potencias = [c1, c2].map((k, i) => {
    const c = curva(k);
    return c && comp ? textoPotencia({ txDbm: lerDbm(c.tx ?? ''), rxDbm: lerDbm(c.rx ?? '') }, i ? comp.perdaTotal2Db : comp.perdaTotal1Db) : '';
  });
  async function pdf() {
    if (!comp || !s1 || !s2) return;
    setGerando(true);
    try {
      await compartilharComparativo(comp, s1, s2, { nomes, curva1: curva(c1)?.nome ?? '', curva2: curva(c2)?.nome ?? '', fibra: tipo === 'fibras' ? '' : fibra || curva(c1)?.fibra || '', modo, potencias });
    } catch (e) { Alert.alert('Não foi possível gerar o PDF', (e as Error).message); } finally { setGerando(false); }
  }

  return (
    <Modal visible={!!curvas} animationType="slide" onRequestClose={fechar}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12}><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topoTitulo}>Comparar curvas</Text>
            <Text style={s.topoSub}>{lista.length} curva(s) · funciona sem internet</Text>
          </View>
          {comp ? (
            <Pressable style={s.pdf} onPress={pdf} disabled={gerando} hitSlop={8}>
              {gerando ? <ActivityIndicator size="small" color="#fff" /> : <Icone nome="file-pdf-box" tamanho={22} cor="#fff" />}
              <Text style={s.pdfTexto}>PDF</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Text style={s.secao}>CURVAS: MARQUE FIBRA, SENTIDO E MOMENTO</Text>
          {lista.map((c) => {
            const l = lidas[c.chave];
            return (
              <View key={c.chave} style={[s.cartao, fibra && c.fibra.trim() !== fibra ? { opacity: 0.45 } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nome} numberOfLines={1}>{c.nome}</Text>
                    <Text style={s.sub}>
                      {typeof l === 'string' ? l : l ? `${rotuloOnda(l)} · ${km(fimDaFibra(l))}${l.data ? ` · ${l.data.toLocaleDateString('pt-BR')}` : ''}` : 'lendo...'}
                    </Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => analisarSozinha(c)}><Text style={s.link}>Analisar só esta</Text></Pressable>
                </View>
                <View style={s.linhaCampos}>
                  <View style={{ width: 80 }}>
                    <Text style={s.rotulo}>Fibra</Text>
                    <TextInput style={s.campo} value={c.fibra} onChangeText={(v) => aoMudar(c.chave, { fibra: v })} keyboardType="default" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rotulo}>Sentido</Text>
                    <Chips valores={['AB', 'BA'] as Sentido[]} rotulo={(v) => ROTULO_SENTIDO[v]} atual={c.sentido}
                      escolher={(v) => aoMudar(c.chave, { sentido: c.sentido === v ? '' : v })} />
                  </View>
                </View>
                <Text style={s.rotulo}>Momento</Text>
                <Chips valores={['antes', 'depois'] as Momento[]} rotulo={(v) => ROTULO_MOMENTO[v]} atual={c.momento}
                  escolher={(v) => aoMudar(c.chave, { momento: c.momento === v ? '' : v })} />
                <View style={s.linhaCampos}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rotulo}>Potência TX dBm (opcional)</Text>
                    <TextInput style={s.campo} value={c.tx ?? ''} onChangeText={(v) => aoMudar(c.chave, { tx: v })} keyboardType="numbers-and-punctuation" placeholder="Ex.: 3,5" placeholderTextColor={cores.apagado} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rotulo}>Potência RX dBm (opcional)</Text>
                    <TextInput style={s.campo} value={c.rx ?? ''} onChangeText={(v) => aoMudar(c.chave, { rx: v })} keyboardType="numbers-and-punctuation" placeholder="Ex.: -18,2" placeholderTextColor={cores.apagado} />
                  </View>
                </View>
              </View>
            );
          })}

          <View style={s.cartao}>
            {fibras.length && tipo !== 'fibras' ? (
              <>
                <Text style={s.rotulo}>Filtrar fibra</Text>
                <Chips valores={['', ...fibras]} rotulo={(v) => (v ? `Fibra ${v}` : 'Todas')} atual={fibra} escolher={setFibra} />
              </>
            ) : null}
            <Text style={s.rotulo}>Comparação</Text>
            <Chips valores={['bidirecional', 'antesDepois', 'fibras'] as Tipo[]} rotulo={(v) => (v === 'bidirecional' ? 'A→B × B→A' : v === 'fibras' ? '2 fibras do cabo' : 'Antes × depois')} atual={tipo} escolher={setTipo} />
            {[[c1, setC1], [c2, setC2]].map(([v, set], i) => (
              <View key={i}>
                <Text style={[s.rotulo, { color: CORES_CURVA[i] }]}>Curva {nomes[i]}</Text>
                <Chips valores={visiveis.map((c) => c.chave)} atual={v as string} escolher={set as (x: string) => void}
                  rotulo={(k) => { const c = curva(k)!; return `${c.nome.slice(0, 24)}${c.fibra ? ` · F${c.fibra}` : ''}${c.sentido ? ` · ${ROTULO_SENTIDO[c.sentido]}` : ''}${c.momento ? ` · ${ROTULO_MOMENTO[c.momento]}` : ''}`; }} />
              </View>
            ))}
            <Text style={s.rotulo}>Eventos analisados</Text>
            <Chips valores={['otdr', 'completa'] as const} rotulo={(v) => (v === 'otdr' ? 'Somente do OTDR' : 'Ler a curva toda')} atual={modo} escolher={setModo} />
          </View>

          {tipo === 'bidirecional' && pareceMesmo ? (
            <Text style={[s.aviso, { backgroundColor: '#D99A001A', color: '#D99A00' }]}>As duas curvas parecem medidas do mesmo lado (o gráfico cruza em X). Se for o caso, escolha "2 fibras do cabo" ou "Antes × depois".</Text>
          ) : null}
          {!comp || !s1 || !s2 ? (
            <Text style={s.sub}>{lista.length < 2 ? 'Marque pelo menos duas curvas.' : 'Escolha as duas curvas para comparar.'}</Text>
          ) : (
            <>
              <View style={s.grade}>
                <Indicador rotulo={`FIBRA ${nomes[0]}`} valor={km(comp.comprimento1Km)} />
                <Indicador rotulo={`FIBRA ${nomes[1]}`} valor={km(comp.comprimento2Km)} alerta={comp.avisos.some((a) => a.nivel === 'critico')} />
                <Indicador rotulo={`PERDA ${nomes[0]}`} valor={`${fmt(comp.perdaTotal1Db)} dB`} />
                <Indicador rotulo={`PERDA ${nomes[1]}`} valor={`${fmt(comp.perdaTotal2Db)} dB`}
                  extra={tipo === 'fibras' ? `diferença ${fmt(Math.abs(comp.perdaTotal2Db - comp.perdaTotal1Db))} dB` : tipo === 'bidirecional' ? `média ${fmt((comp.perdaTotal1Db + comp.perdaTotal2Db) / 2)} dB` : `diferença ${fmt(comp.perdaTotal2Db - comp.perdaTotal1Db)} dB`} />
              </View>
              {potencias.map((t, i) => (t ? (
                <Text key={`p${i}`} style={[s.aviso, { backgroundColor: '#EEF4FB', color: '#163A6B' }]}>{nomes[i]} · {t}</Text>
              ) : null))}
              {comp.avisos.map((a, i) => (
                <Text key={i} style={[s.aviso, { backgroundColor: `${COR[a.nivel]}1A`, color: a.nivel === 'ok' ? '#14532d' : COR[a.nivel] }]}>{a.texto}</Text>
              ))}
              <View style={s.cartao}>
                <Sobreposto s1={s1} s2={s2} espelhar={tipo === 'bidirecional'} comp={comp} largura={width - 56} />
                <Text style={s.legenda}>
                  <Text style={{ color: CORES_CURVA[0] }}>━ </Text>{nomes[0]}   <Text style={{ color: CORES_CURVA[1] }}>━ </Text>{nomes[1]}
                  {tipo === 'bidirecional' ? ' (espelhada, OTDR no lado B)' : ''}
                </Text>
              </View>
              {comp.linhas.map((l, i) => (
                <View key={i} style={s.cartao}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.numero, { backgroundColor: COR[l.nivel] }]}><Text style={s.numeroTexto}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nome}>{km(l.km)} de A{l.reflexivo ? ' · reflexivo' : ''}</Text>
                      <Text style={s.sub}>
                        {nomes[0]} {l.perda1 == null ? '—' : `${fmt(l.perda1, 3)} dB`} · {nomes[1]} {l.perda2 == null ? '—' : `${fmt(l.perda2, 3)} dB`}
                      </Text>
                      {l.resultado != null ? (
                        <Text style={[s.sub, { fontWeight: '800', color: cores.texto }]}>
                          {tipo === 'bidirecional' ? `Média ${fmt(l.resultado, 3)} dB` : tipo === 'fibras' ? `Perda comum ${fmt(l.resultado, 3)} dB` : `Diferença ${l.resultado > 0 ? '+' : ''}${fmt(l.resultado, 3)} dB`}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[s.selo, { backgroundColor: `${COR[l.nivel]}1F` }]}><Text style={[s.seloTexto, { color: COR[l.nivel] }]}>{l.situacao.toUpperCase()}</Text></View>
                  </View>
                  <Text style={s.texto}>{l.texto}</Text>
                </View>
              ))}
              <Text style={s.sub}>
                {tipo === 'bidirecional' ? 'A perda real de cada emenda é a média dos dois sentidos. As distâncias do B → A foram espelhadas para contar a partir de A.'
                  : tipo === 'fibras' ? 'Perda comum = a menor perda das duas fibras no mesmo ponto. Acima de 0,15 dB nas duas é esforço no cabo (torção, esmagamento, curvatura, ferragem apertada) ou acomodação ruim na caixa; perda alta só numa fibra é fusão/acomodação daquela fibra.'
                  : 'Diferença = depois − antes. Piorou acima de 0,10 dB; acima de 0,30 dB é crítico.'}
              </Text>
            </>
          )}
        </ScrollView>
      </View>
      <MargemInferior />
    </Modal>
  );
}

function Chips<T extends string>({ valores, rotulo, atual, escolher }: { valores: readonly T[]; rotulo: (v: T) => string; atual: T | ''; escolher: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {valores.map((v) => (
        <Pressable key={v || 'todas'} style={[s.chip, atual === v && s.chipAtivo]} onPress={() => escolher(v)}>
          <Text style={[s.chipTexto, atual === v && { color: '#fff' }]} numberOfLines={1}>{rotulo(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Indicador({ rotulo, valor, extra, alerta }: { rotulo: string; valor: string; extra?: string; alerta?: boolean }) {
  return (
    <View style={[s.indicador, alerta && { backgroundColor: '#FDECEC', borderColor: '#F6C9C6' }]}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={[s.indValor, alerta && { color: cores.perigo }]}>{valor}</Text>
      {extra ? <Text style={s.sub}>{extra}</Text> : null}
    </View>
  );
}

function Sobreposto({ s1, s2, espelhar, comp, largura }: { s1: Sor; s2: Sor; espelhar: boolean; comp: Comparacao; largura: number }) {
  const L = largura, A = 230, m = { e: 34, d: 6, t: 20, b: 20 };
  const t1 = tracoParaComparar(s1), t2 = tracoParaComparar(s2, espelhar ? { comprimentoKm: fimDaFibra(s1) } : undefined);
  const todos = [...t1, ...t2];
  if (!todos.length) return null;
  const maxKm = Math.max(...todos.map((p) => p.km)) || 1;
  const dbs = todos.map((p) => p.db).sort((a, b) => a - b);
  const minDb = dbs[Math.floor(dbs.length * 0.02)], maxDb = Math.max(1, dbs[Math.floor(dbs.length * 0.995)]);
  const x = (k: number) => m.e + (k / maxKm) * (L - m.e - m.d);
  const y = (d: number) => m.t + ((maxDb - Math.min(maxDb, Math.max(minDb, d))) / (maxDb - minDb || 1)) * (A - m.t - m.b);
  const caminho = (t: { km: number; db: number }[]) => t.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join('');
  const passoKm = [0.5, 1, 2, 5, 10, 20, 50].find((v) => maxKm / v <= 5) ?? 100;
  const passoDb = [1, 2, 5, 10, 20].find((v) => (maxDb - minDb) / v <= 5) ?? 50;
  return (
    <Svg width={L} height={A}>
      {Array.from({ length: Math.floor(maxKm / passoKm) + 1 }, (_, i) => i * passoKm).map((k) => (
        <SvgText key={`x${k}`} x={x(k)} y={A - 5} fontSize={9.5} fill="#667085" textAnchor="middle">{`${k} km`}</SvgText>
      ))}
      {Array.from({ length: Math.floor((maxDb - minDb) / passoDb) + 1 }, (_, i) => Math.ceil(minDb / passoDb) * passoDb + i * passoDb).map((d) => (
        <Line key={`l${d}`} x1={m.e} x2={L - m.d} y1={y(d)} y2={y(d)} stroke="#E4E7EC" />
      ))}
      {Array.from({ length: Math.floor((maxDb - minDb) / passoDb) + 1 }, (_, i) => Math.ceil(minDb / passoDb) * passoDb + i * passoDb).map((d) => (
        <SvgText key={`y${d}`} x={m.e - 4} y={y(d) + 3} fontSize={9.5} fill="#667085" textAnchor="end">{`${d}`}</SvgText>
      ))}
      <Path d={caminho(t1)} fill="none" stroke={CORES_CURVA[0]} strokeWidth={1.4} />
      <Path d={caminho(t2)} fill="none" stroke={CORES_CURVA[1]} strokeWidth={1.4} />
      {comp.linhas.map((l, i) => (
        <Line key={`e${i}`} x1={x(l.km)} x2={x(l.km)} y1={m.t} y2={A - m.b} stroke={COR[l.nivel]} strokeWidth={1} strokeDasharray="3 3" />
      ))}
      {comp.linhas.map((l, i) => <Circle key={`c${i}`} cx={x(l.km)} cy={m.t - 9} r={7.5} fill={COR[l.nivel]} />)}
      {comp.linhas.map((l, i) => (
        <SvgText key={`t${i}`} x={x(l.km)} y={m.t - 5.5} fontSize={9} fontWeight="bold" fill="#fff" textAnchor="middle">{`${i + 1}`}</SvgText>
      ))}
    </Svg>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  topoTitulo: { color: '#fff', fontSize: 18, fontWeight: '800' },
  topoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 10, height: 36 },
  pdfTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5 },
  cartao: { backgroundColor: cores.cartao, borderRadius: 16, padding: 12, gap: 4, ...sombra },
  nome: { fontSize: 15, fontWeight: '800', color: cores.texto },
  sub: { fontSize: 12, color: cores.suave },
  link: { color: cores.primaria, fontWeight: '700', fontSize: 12.5 },
  linhaCampos: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rotulo: { fontSize: 10.5, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginTop: 6 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, color: cores.texto, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, maxWidth: '100%' },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { fontSize: 13, fontWeight: '700', color: cores.texto },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  indicador: { width: '48.5%', backgroundColor: cores.cartao, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: cores.borda },
  indValor: { fontSize: 18, fontWeight: '800', color: cores.texto, marginTop: 2 },
  aviso: { borderRadius: 12, padding: 12, fontSize: 13.5, fontWeight: '600', overflow: 'hidden' },
  legenda: { fontSize: 12, color: cores.suave, marginTop: 4 },
  numero: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seloTexto: { fontSize: 11, fontWeight: '800' },
  texto: { fontSize: 13.5, color: cores.texto2, marginTop: 6, lineHeight: 19 },
});
