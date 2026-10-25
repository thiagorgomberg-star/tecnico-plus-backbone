import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, GestureResponderEvent, Modal, PanResponder, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { cores, sombra } from '../lib/estilo';
import { analisarSor, km, lerSor, Nivel, Sor, tracoJanela } from '../lib/sor';
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
  const [janela, setJanela] = useState<Janela>({ ini: 0, fim: 1 });
  const { width } = useWindowDimensions();
  const rolar = useRef<ScrollViewInstance>(null);

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
        const msg = (e as Error).message || '';
        setErro(/DataView|bounds|bytes/i.test(msg) ? 'Não foi possível ler esta curva: o arquivo parece incompleto ou num formato .SOR que o app ainda não reconhece.' : msg || 'Arquivo .SOR inválido.');
      }
    })();
  }, [curva?.caminho, curva?.uri]);

  useEffect(() => { if (sor) setJanela(janelaInicial(sor)); }, [sor]);
  // Tocar num evento (no traço ou no cartão) aproxima nele.
  const selecionar = (i: number) => {
    setSelecionado(i);
    if (sor?.eventos[i]) setJanela(janelaEvento(sor, sor.eventos[i].distanciaKm));
  };

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
          <ScrollView ref={rolar} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
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
                <Traco sor={sor} niveis={analise.diagnosticos.map((d) => d.nivel)} largura={width - 56} selecionado={selecionado} selecionar={selecionar}
                  janela={janela} setJanela={setJanela} />
              </View>
            ) : null}

            {analise.diagnosticos.map((d, i) => (
              <Pressable key={i} style={[s.cartao, s.evento, selecionado === i && { borderColor: COR[d.nivel], borderWidth: 2 }]} onPress={() => { selecionar(i); rolar.current?.scrollTo({ y: 0, animated: true }); }}>
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

type Janela = { ini: number; fim: number };
const passoEixo = (span: number, alvo: number) => [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find((v) => span / v <= alvo) ?? 200;
const rotuloKm = (k: number) => (Math.abs(k) < 1 && k !== 0 ? `${Math.round(k * 1000)} m` : `${Number(k.toFixed(2)).toLocaleString('pt-BR')} km`);
const totalKm = (sor: Sor) => Math.max(sor.traco.at(-1)?.km ?? 0, ...sor.eventos.map((e) => e.distanciaKm)) || 1;

// Vista inicial: do início até um pouco depois do fim da fibra (sem o ruído que vem depois).
function janelaInicial(sor: Sor): Janela {
  const total = totalKm(sor);
  const fimFibra = sor.eventos.find((e) => e.fimDeFibra)?.distanciaKm ?? total;
  return { ini: 0, fim: Math.min(total, Math.max(fimFibra * 1.08, fimFibra + 0.2)) };
}

// Aproxima num evento: ~600 m em volta (ou mais, se a resolução do OTDR for grossa).
function janelaEvento(sor: Sor, km: number): Janela {
  const meia = Math.max(0.3, (sor.resolucaoM / 1000) * 60);
  const total = totalKm(sor);
  const ini = Math.min(Math.max(km - meia, 0), Math.max(total - 2 * meia, 0));
  return { ini, fim: Math.min(total, ini + 2 * meia) };
}

// Traço do OTDR com zoom: pinça com dois dedos aproxima/afasta, arrastar para o lado desliza; os botões fazem o mesmo.
function Traco({ sor, niveis, largura, selecionado, selecionar, janela, setJanela }: {
  sor: Sor; niveis: Nivel[]; largura: number; selecionado: number | null; selecionar: (i: number) => void;
  janela: Janela; setJanela: (j: Janela) => void;
}) {
  const A = 240, m = { e: 34, d: 8, t: 26, b: 22 };
  const total = totalKm(sor);
  const { ini, fim } = janela;
  const pontos = useMemo(() => tracoJanela(sor, ini, fim), [sor, ini, fim]);
  const dbs = pontos.map((p) => p.db);
  const maxDb = dbs.length ? Math.max(...dbs) : 1, minDb = dbs.length ? Math.min(...dbs) : 0;
  const folga = (maxDb - minDb) * 0.06 || 0.5;
  const topo = maxDb + folga, base = minDb - folga;
  const larguraUtil = largura - m.e - m.d;
  const x = (k: number) => m.e + ((k - ini) / (fim - ini)) * larguraUtil;
  const y = (d: number) => m.t + ((topo - d) / (topo - base)) * (A - m.t - m.b);
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join('');
  const pk = passoEixo(fim - ini, 4);
  const pd = passoEixo(topo - base, 4);
  const marcasKm = Array.from({ length: Math.floor((fim - ini) / pk) + 2 }, (_, i) => Math.ceil(ini / pk) * pk + i * pk).filter((k) => k <= fim);
  const marcasDb = Array.from({ length: Math.floor((topo - base) / pd) + 2 }, (_, i) => Math.ceil(base / pd) * pd + i * pd).filter((d) => d <= topo);
  const visiveis = sor.eventos.map((e, i) => ({ e, i })).filter(({ e }) => e.distanciaKm >= ini && e.distanciaKm <= fim);

  const minimo = Math.max((sor.resolucaoM / 1000) * 40, 0.05);
  const limitar = (a: number, b: number): Janela => {
    const span = Math.min(Math.max(b - a, minimo), total);
    const i0 = Math.min(Math.max(a, 0), total - span);
    return { ini: i0, fim: i0 + span };
  };
  const zoom = (fator: number) => {
    const meio = (ini + fim) / 2, span = (fim - ini) * fator;
    setJanela(limitar(meio - span / 2, meio + span / 2));
  };
  const deslizar = (fracao: number) => setJanela(limitar(ini + (fim - ini) * fracao, fim + (fim - ini) * fracao));

  // Gestos com o PanResponder do próprio React Native (sem módulo nativo novo, funciona no APK atual).
  const atual = useRef(janela);
  atual.current = janela;
  const inicio = useRef<{ janela: Janela; dist: number | null; meio: number }>({ janela, dist: null, meio: 0 });
  const gestos = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (ev, g) => ev.nativeEvent.touches.length >= 2 || (Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { inicio.current = { janela: atual.current, dist: null, meio: 0 }; },
    onPanResponderMove: (ev: GestureResponderEvent, g) => {
      const t = ev.nativeEvent.touches;
      const j0 = inicio.current.janela;
      const span0 = j0.fim - j0.ini;
      if (t.length >= 2) {
        const dist = Math.abs(t[0].pageX - t[1].pageX) || 1;
        const meio = (t[0].locationX + t[1].locationX) / 2;
        if (inicio.current.dist == null) { inicio.current.dist = dist; inicio.current.meio = meio; return; }
        const frac = Math.min(Math.max((inicio.current.meio - m.e) / larguraUtil, 0), 1);
        const kmMeio = j0.ini + frac * span0;
        const novoSpan = span0 * (inicio.current.dist / dist);
        setJanela(limitar(kmMeio - frac * novoSpan, kmMeio + (1 - frac) * novoSpan));
      } else if (inicio.current.dist == null) {
        const desloc = (-g.dx / larguraUtil) * span0;
        setJanela(limitar(j0.ini + desloc, j0.fim + desloc));
      }
    },
  }), [total, larguraUtil, minimo]);

  return (
    <View>
      <View {...gestos.panHandlers}>
        <Svg width={largura} height={A}>
          {marcasKm.map((k) => <Line key={`x${k}`} x1={x(k)} x2={x(k)} y1={m.t} y2={A - m.b} stroke="#E4E7EC" />)}
          {marcasKm.map((k) => (
            <SvgText key={`tx${k}`} x={x(k)} y={A - 6} fontSize={10} fill={cores.suave} textAnchor="middle">{rotuloKm(k)}</SvgText>
          ))}
          {marcasDb.map((d) => <Line key={`y${d}`} x1={m.e} x2={largura - m.d} y1={y(d)} y2={y(d)} stroke="#EEF0F3" />)}
          {marcasDb.map((d) => (
            <SvgText key={`ty${d}`} x={m.e - 4} y={y(d) + 3} fontSize={10} fill={cores.suave} textAnchor="end">{`${Number(d.toFixed(2))}`}</SvgText>
          ))}
          <Path d={caminho} fill="none" stroke={cores.cabecalho} strokeWidth={1.3} />
          {visiveis.map(({ e, i }) => (
            <Line key={`l${i}`} x1={x(e.distanciaKm)} x2={x(e.distanciaKm)} y1={m.t} y2={A - m.b} stroke={COR[niveis[i]]}
              strokeWidth={selecionado === i ? 2.5 : 1.2} strokeDasharray={selecionado === i ? undefined : '4,3'} />
          ))}
          {visiveis.map(({ e, i }) => (
            <Circle key={`c${i}`} cx={x(e.distanciaKm)} cy={m.t - 12} r={9} fill={COR[niveis[i]]} onPress={() => selecionar(i)} />
          ))}
          {visiveis.map(({ e, i }) => (
            <SvgText key={`t${i}`} x={x(e.distanciaKm)} y={m.t - 8} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">{`${e.numero}`}</SvgText>
          ))}
        </Svg>
      </View>
      <View style={s.zoomLinha}>
        <Pressable style={s.zoomBotao} onPress={() => deslizar(-0.5)}><Icone nome="chevron-left" tamanho={22} cor={cores.primaria} /></Pressable>
        <Pressable style={s.zoomBotao} onPress={() => zoom(2)}><Icone nome="magnify-minus-outline" tamanho={22} cor={cores.primaria} /></Pressable>
        <Text style={s.zoomTexto}>{rotuloKm(ini)} – {rotuloKm(fim)}</Text>
        <Pressable style={s.zoomBotao} onPress={() => zoom(0.5)}><Icone nome="magnify-plus-outline" tamanho={22} cor={cores.primaria} /></Pressable>
        <Pressable style={s.zoomBotao} onPress={() => deslizar(0.5)}><Icone nome="chevron-right" tamanho={22} cor={cores.primaria} /></Pressable>
      </View>
      <Pressable onPress={() => setJanela(janelaInicial(sor))} hitSlop={6}>
        <Text style={s.zoomTudo}>Ver a fibra inteira</Text>
      </Pressable>
      <Text style={s.zoomDica}>Pinça com dois dedos para zoom, arraste para o lado, ou toque num evento.</Text>
    </View>
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
  zoomLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  zoomBotao: { width: 40, height: 36, borderRadius: 10, backgroundColor: cores.selecionado, alignItems: 'center', justifyContent: 'center' },
  zoomTexto: { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: cores.texto },
  zoomTudo: { textAlign: 'center', color: cores.primaria, fontWeight: '700', fontSize: 13, marginTop: 8 },
  zoomDica: { textAlign: 'center', color: cores.suave, fontSize: 11.5, marginTop: 2 },
  seloTexto: { fontSize: 11, fontWeight: '800' },
});
