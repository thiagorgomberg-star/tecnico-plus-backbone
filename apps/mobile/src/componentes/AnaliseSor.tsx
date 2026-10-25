import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { cores, sombra } from '../lib/estilo';
import { analisarSor, km, lerSor, Nivel, Sor } from '../lib/sor';
import { supabase } from '../lib/supabase';
import Icone from './Icone';

const COR: Record<Nivel, string> = { ok: '#1E9E4A', atencao: '#D99A00', critico: '#D0453B' };
const ROTULO: Record<Nivel, string> = { ok: 'OK', atencao: 'ATENÇÃO', critico: 'CRÍTICO' };
const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Análise do .SOR do OTDR no celular: resumo, traço com os eventos e o que fazer em cada um.
// Curva do trecho (bucket): fica guardada depois da primeira abertura e abre de novo sem internet.
// Curva do próprio celular (uri): lida direto do arquivo, totalmente offline.
export default function AnaliseSor({ curva, extensaoKm, fechar }: {
  curva: { nome: string; bucket?: string; caminho?: string; uri?: string } | null; extensaoKm: number | null; fechar: () => void;
}) {
  const [sor, setSor] = useState<Sor | null>(null);
  const [erro, setErro] = useState('');
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    setSor(null);
    setErro('');
    setSelecionado(null);
    if (!curva) return;
    (async () => {
      try {
        if (curva.uri) return setSor(lerSor(await new File(curva.uri).bytes()));
        if (!curva.bucket || !curva.caminho) throw new Error('Curva sem arquivo.');
        const pasta = new Directory(Paths.document, 'curvas');
        if (!pasta.exists) pasta.create({ intermediates: true });
        const arquivo = new File(pasta, curva.caminho.replace(/[^\w.-]+/g, '_'));
        if (!arquivo.exists) {
          const { data } = await supabase.storage.from(curva.bucket).createSignedUrl(curva.caminho, 600);
          if (!data) throw new Error('Sem internet: para abrir a curva pela primeira vez é preciso estar conectado.');
          await File.downloadFileAsync(data.signedUrl, arquivo);
        }
        setSor(lerSor(await arquivo.bytes()));
      } catch (e) {
        setErro((e as Error).message || 'Arquivo .SOR inválido.');
      }
    })();
  }, [curva?.caminho, curva?.uri]);

  const analise = useMemo(() => (sor ? analisarSor(sor, extensaoKm) : null), [sor, extensaoKm]);

  return (
    <Modal visible={!!curva} animationType="slide" onRequestClose={fechar}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12}><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topoTitulo}>Análise da curva OTDR</Text>
            <Text style={s.topoSub} numberOfLines={1}>{curva?.nome}</Text>
          </View>
        </View>
        {erro ? <Text style={s.erro}>{erro}</Text> : !sor || !analise ? <ActivityIndicator style={{ marginTop: 40 }} color={cores.primaria} /> : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
            <View style={s.grade}>
              <Indicador rotulo="FIBRA" valor={km(analise.comprimentoKm)} alerta={!!extensaoKm && analise.comprimentoKm < extensaoKm * 0.97}
                extra={extensaoKm ? `trecho ${km(extensaoKm)}` : undefined} />
              <Indicador rotulo="PERDA TOTAL" valor={`${fmt(analise.perdaTotalDb)} dB`} />
              <Indicador rotulo="ATENUAÇÃO" valor={analise.atenuacaoMediaDbKm != null ? `${fmt(analise.atenuacaoMediaDbKm, 3)} dB/km` : '—'} />
              <Indicador rotulo="EVENTOS" valor={`${sor.eventos.length}`} alerta={analise.criticos > 0}
                extra={`${analise.criticos} crítico · ${analise.atencao} atenção`} />
            </View>
            <Text style={s.info}>
              {[sor.fabricante, sor.equipamento].filter(Boolean).join(' ')} · {sor.comprimentoOndaNm} nm · pulso {sor.pulsoNs} ns
              {sor.data ? ` · ${sor.data.toLocaleDateString('pt-BR')}` : ''}{sor.localA || sor.localB ? ` · ${sor.localA || '?'} → ${sor.localB || '?'}` : ''}
            </Text>

            {sor.traco.length ? (
              <View style={s.cartao}>
                <Traco sor={sor} niveis={analise.diagnosticos.map((d) => d.nivel)} largura={width - 56} selecionado={selecionado} selecionar={setSelecionado} />
              </View>
            ) : null}

            {analise.diagnosticos.map((d, i) => (
              <Pressable key={i} style={[s.cartao, s.evento, selecionado === i && { borderColor: COR[d.nivel], borderWidth: 2 }]} onPress={() => setSelecionado(i)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.numero, { backgroundColor: COR[d.nivel] }]}><Text style={s.numeroTexto}>{d.evento.numero}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventoTitulo}>{km(d.evento.distanciaKm)} · {d.tipo}</Text>
                    <Text style={s.eventoSub}>
                      Perda {fmt(d.evento.perdaDb, 3)} dB{d.evento.reflectanciaDb ? ` · Reflexão ${fmt(d.evento.reflectanciaDb)} dB` : ''}
                      {d.evento.inclinacaoDbKm ? ` · Lance ${fmt(d.evento.inclinacaoDbKm, 3)} dB/km` : ''}
                    </Text>
                  </View>
                  <View style={[s.selo, { backgroundColor: `${COR[d.nivel]}1F` }]}><Text style={[s.seloTexto, { color: COR[d.nivel] }]}>{ROTULO[d.nivel]}</Text></View>
                </View>
                <Text style={s.eventoTexto}>{d.texto}</Text>
              </Pressable>
            ))}
            <Text style={s.info}>A distância é a da fibra (inclui sobras técnicas), não a do mapa. Use as caixas mais próximas como referência.</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Indicador({ rotulo, valor, extra, alerta }: { rotulo: string; valor: string; extra?: string; alerta?: boolean }) {
  return (
    <View style={[s.indicador, alerta && { backgroundColor: '#FDECEC', borderColor: '#F6C9C6' }]}>
      <Text style={s.indRotulo}>{rotulo}</Text>
      <Text style={[s.indValor, alerta && { color: cores.perigo }]}>{valor}</Text>
      {extra ? <Text style={s.indExtra}>{extra}</Text> : null}
    </View>
  );
}

function Traco({ sor, niveis, largura, selecionado, selecionar }: {
  sor: Sor; niveis: Nivel[]; largura: number; selecionado: number | null; selecionar: (i: number) => void;
}) {
  const A = 220, m = { e: 34, d: 8, t: 26, b: 22 };
  const maxKm = Math.max(...sor.traco.map((p) => p.km), ...sor.eventos.map((e) => e.distanciaKm)) || 1;
  const dbs = sor.traco.map((p) => p.db);
  const maxDb = Math.max(...dbs), minDb = Math.min(...dbs);
  const x = (k: number) => m.e + (k / maxKm) * (largura - m.e - m.d);
  const y = (d: number) => m.t + ((maxDb - d) / (maxDb - minDb || 1)) * (A - m.t - m.b);
  const caminho = sor.traco.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join('');
  const passoKm = [0.5, 1, 2, 5, 10, 20, 50].find((v) => maxKm / v <= 5) ?? 100;
  const passoDb = [2, 5, 10, 20].find((v) => (maxDb - minDb) / v <= 4) ?? 50;
  return (
    <Svg width={largura} height={A}>
      {Array.from({ length: Math.floor(maxKm / passoKm) + 1 }, (_, i) => i * passoKm).map((k) => (
        <Line key={`x${k}`} x1={x(k)} x2={x(k)} y1={m.t} y2={A - m.b} stroke="#E4E7EC" />
      ))}
      {Array.from({ length: Math.floor(maxKm / passoKm) + 1 }, (_, i) => i * passoKm).map((k) => (
        <SvgText key={`tx${k}`} x={x(k)} y={A - 6} fontSize={10} fill={cores.suave} textAnchor="middle">{`${k} km`}</SvgText>
      ))}
      {Array.from({ length: Math.floor((maxDb - minDb) / passoDb) + 1 }, (_, i) => Math.ceil(minDb / passoDb) * passoDb + i * passoDb).map((d) => (
        <SvgText key={`y${d}`} x={m.e - 4} y={y(d) + 3} fontSize={10} fill={cores.suave} textAnchor="end">{`${d}`}</SvgText>
      ))}
      <Path d={caminho} fill="none" stroke={cores.cabecalho} strokeWidth={1.3} />
      {sor.eventos.map((e, i) => (
        <Line key={`l${i}`} x1={x(e.distanciaKm)} x2={x(e.distanciaKm)} y1={m.t} y2={A - m.b} stroke={COR[niveis[i]]}
          strokeWidth={selecionado === i ? 2.5 : 1.2} strokeDasharray={selecionado === i ? undefined : '4,3'} />
      ))}
      {sor.eventos.map((e, i) => (
        <Circle key={`c${i}`} cx={x(e.distanciaKm)} cy={m.t - 12} r={9} fill={COR[niveis[i]]} onPress={() => selecionar(i)} />
      ))}
      {sor.eventos.map((e, i) => (
        <SvgText key={`t${i}`} x={x(e.distanciaKm)} y={m.t - 8} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">{`${e.numero}`}</SvgText>
      ))}
    </Svg>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  topoTitulo: { color: '#fff', fontSize: 18, fontWeight: '800' },
  topoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  erro: { color: cores.perigo, margin: 24, textAlign: 'center' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  indicador: { width: '48.5%', backgroundColor: cores.cartao, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: cores.borda },
  indRotulo: { fontSize: 10.5, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5 },
  indValor: { fontSize: 18, fontWeight: '800', color: cores.texto, marginTop: 2 },
  indExtra: { fontSize: 11.5, color: cores.suave, marginTop: 1 },
  info: { fontSize: 12, color: cores.suave },
  cartao: { backgroundColor: cores.cartao, borderRadius: 16, padding: 12, ...sombra },
  evento: { borderWidth: 1, borderColor: 'transparent' },
  numero: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
  eventoTitulo: { fontSize: 15, fontWeight: '800', color: cores.texto },
  eventoSub: { fontSize: 12, color: cores.suave, marginTop: 1 },
  eventoTexto: { fontSize: 13.5, color: cores.texto2, marginTop: 8, lineHeight: 19 },
  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seloTexto: { fontSize: 11, fontWeight: '800' },
});
