import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { cores, sombra } from '../lib/estilo';
import { CaixaRede, rotuloPonto } from '../lib/fusao';
import { distanciaKm } from '../lib/navegacao';
import Icone from './Icone';

type ComLocal = CaixaRede & { latitude?: number | null; longitude?: number | null; endereco?: string | null };
type Item = ComLocal & { lat: number; lng: number; distancia: number | null };
const COR_TIPO: Record<string, string> = { emenda: '#1F6FD1', entroncamento: '#7A5AA6', dgo: '#163A6B', site: '#227E9E' };
const ALTURA = 380;
const MARGEM = 30;
const fmtKm = (k: number) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1).replace('.', ',')} km`);

// Mapa das caixas já cadastradas na rede (desenhado no próprio app, funciona sem internet com o que está guardado).
// Toca no pin e escolhe a caixa de onde vem a fibra (anterior) ou para onde vai uma saída (seguinte).
export default function MapaCaixas({ aberto, modo, caixas, aqui, atual, escolher, fechar }: {
  aberto: boolean; modo: { tipo: 'anterior' } | { tipo: 'seguinte'; saida: number };
  caixas: CaixaRede[]; aqui: { lat: number; lng: number } | null; atual: string | null;
  escolher: (c: CaixaRede) => void; fechar: () => void;
}) {
  const { width } = useWindowDimensions();
  const largura = Math.min(width, 600) - 32;
  const [selecionado, setSelecionado] = useState<string | null>(atual);
  const seguinte = modo.tipo === 'seguinte';
  // A anterior precisa ter saída (a fibra sai dela); a seguinte pode ser qualquer caixa.
  const serve = (c: CaixaRede) => seguinte || c.saidas.length > 0;
  useEffect(() => { if (aberto) setSelecionado(atual); }, [aberto, atual]);
  const [zoom, setZoom] = useState(1);

  const itens: Item[] = useMemo(() => (caixas as ComLocal[])
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => {
      const p = { lat: c.latitude!, lng: c.longitude! };
      return { ...c, ...p, distancia: aqui ? distanciaKm(aqui, p) : null };
    })
    .sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0)), [caixas, aqui]);
  const semLocal = caixas.length - itens.length;
  const sel = itens.find((c) => c.id === selecionado) ?? null;

  const projecao = useMemo(() => {
    // Enquadra a posição atual e as caixas mais próximas (até 15), para não virar um ponto só quando a rede é grande.
    const perto = itens.slice(0, 15);
    const pontos = [...perto.map((c) => ({ lat: c.lat, lng: c.lng })), ...(aqui ? [aqui] : [])];
    if (!pontos.length) return null;
    const lats = pontos.map((p) => p.lat), lngs = pontos.map((p) => p.lng);
    const latMeio = (Math.min(...lats) + Math.max(...lats)) / 2;
    const fx = Math.cos((latMeio * Math.PI) / 180);
    const kmX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 111.32 * fx, 0.5);
    const kmY = Math.max((Math.max(...lats) - Math.min(...lats)) * 110.57, 0.5);
    const escala = Math.min((largura - 2 * MARGEM) / kmX, (ALTURA - 2 * MARGEM) / kmY) * zoom;
    const centro = sel && zoom > 1 ? { lat: sel.lat, lng: sel.lng } : { lat: latMeio, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
    const xy = (p: { lat: number; lng: number }) => ({
      x: largura / 2 + (p.lng - centro.lng) * 111.32 * fx * escala,
      y: ALTURA / 2 - (p.lat - centro.lat) * 110.57 * escala,
    });
    const alvo = largura / 4 / escala;
    const passo = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].reverse().find((v) => v <= alvo) ?? 0.05;
    return { xy, escala, passo };
  }, [itens, aqui, largura, zoom, sel]);

  // As ligações já cadastradas entre caixas aparecem como linhas (ajuda a ver a sequência da rota).
  const ligacoes = projecao ? itens.flatMap((c) => {
    const ant = itens.find((x) => x.id === c.origem_caixa_id);
    return ant ? [{ id: c.id, a: projecao.xy(ant), b: projecao.xy(c) }] : [];
  }) : [];

  return (
    <Modal visible={aberto} animationType="slide" onRequestClose={fechar}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12}><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topoTitulo}>{seguinte ? `Para onde vai a saída ${modo.saida}?` : 'De qual caixa vem a fibra?'}</Text>
            <Text style={s.topoSub}>{seguinte ? 'Toque no pin da caixa seguinte' : 'Toque no pin da caixa anterior'}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={s.cartao}>
            {!projecao ? <Text style={s.vazio}>Nenhuma caixa da rede tem localização ainda.</Text> : (
              <View>
                <Svg width={largura} height={ALTURA}>
                  <Rect x={0} y={0} width={largura} height={ALTURA} fill="#EEF3F8" />
                  {Array.from({ length: 7 }, (_, i) => (
                    <G key={i}>
                      <Line x1={(largura / 6) * i} y1={0} x2={(largura / 6) * i} y2={ALTURA} stroke="#DCE4EE" />
                      <Line x1={0} y1={(ALTURA / 6) * i} x2={largura} y2={(ALTURA / 6) * i} stroke="#DCE4EE" />
                    </G>
                  ))}
                  {ligacoes.map((l) => <Line key={l.id} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#9AA8BA" strokeWidth={2} />)}
                  {sel && aqui ? (() => {
                    const a = projecao.xy(aqui), b = projecao.xy(sel);
                    return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={cores.primaria} strokeWidth={2} strokeDasharray="5,4" />;
                  })() : null}
                  {itens.map((c) => {
                    const { x, y } = projecao.xy(c);
                    if (x < -20 || x > largura + 20 || y < -20 || y > ALTURA + 20) return null;
                    const ativo = c.id === selecionado;
                    const semSaida = !serve(c);
                    return (
                      <G key={c.id} onPress={() => setSelecionado(c.id)}>
                        <Circle cx={x} cy={y} r={ativo ? 14 : 11} fill={semSaida ? '#B8C0CC' : COR_TIPO[c.tipo ?? 'emenda'] ?? cores.primaria}
                          stroke={ativo ? '#F5B301' : '#fff'} strokeWidth={ativo ? 4 : 2.5} />
                        <SvgText x={x} y={y - 17} fontSize={10.5} fontWeight="bold" fill={cores.texto} textAnchor="middle">{c.identificacao}</SvgText>
                      </G>
                    );
                  })}
                  {aqui ? (() => {
                    const { x, y } = projecao.xy(aqui);
                    return (
                      <G>
                        <Circle cx={x} cy={y} r={16} fill="rgba(208,69,59,0.18)" />
                        <Circle cx={x} cy={y} r={7} fill="#D0453B" stroke="#fff" strokeWidth={2.5} />
                      </G>
                    );
                  })() : null}
                  <Line x1={12} y1={ALTURA - 14} x2={12 + projecao.passo * projecao.escala} y2={ALTURA - 14} stroke={cores.texto2} strokeWidth={3} />
                  <SvgText x={12} y={ALTURA - 20} fontSize={11} fill={cores.texto2}>{fmtKm(projecao.passo)}</SvgText>
                  <SvgText x={largura - 12} y={ALTURA - 12} fontSize={13} fontWeight="bold" fill={cores.suave} textAnchor="end">N ↑</SvgText>
                </Svg>
                <View style={s.zoom}>
                  <Pressable style={s.zoomBotao} onPress={() => setZoom((z) => Math.min(z * 2, 64))}><Icone nome="plus" tamanho={22} cor={cores.primaria} /></Pressable>
                  <Pressable style={s.zoomBotao} onPress={() => setZoom((z) => Math.max(z / 2, 1))}><Icone nome="minus" tamanho={22} cor={cores.primaria} /></Pressable>
                </View>
              </View>
            )}
            <View style={s.legenda}>
              {[['#1F6FD1', 'Emenda'], ['#7A5AA6', 'Entroncamento'], ['#163A6B', 'DGO'], ...(seguinte ? [] : [['#B8C0CC', 'Sem saída']]), ['#D0453B', 'Esta caixa']].map(([c, t]) => (
                <View key={t} style={s.legendaItem}><View style={[s.bolinha, { backgroundColor: c }]} /><Text style={s.legendaTexto}>{t}</Text></View>
              ))}
            </View>
            {semLocal > 0 ? <Text style={s.aviso}>{semLocal} caixa(s) sem localização aparecem só na lista do formulário.</Text> : null}

            {sel ? (
              <View style={s.selecao}>
                <Text style={s.selTitulo}>{sel.identificacao}</Text>
                <Text style={s.selSub}>
                  {rotuloPonto(sel.tipo ?? 'emenda')}{sel.distancia != null ? ` · ${fmtKm(sel.distancia)} daqui` : ''}
                  {sel.saidas.length ? ` · ${sel.saidas.length} saída(s): ${sel.saidas.map((q) => `${q} FO`).join(', ')}` : ''}
                </Text>
                {sel.endereco ? <Text style={s.selSub}>{sel.endereco}</Text> : null}
                {sel.origem_caixa_id && seguinte ? <Text style={[s.aviso, { paddingHorizontal: 0 }]}>
                  Hoje ela vem de {itens.find((x) => x.id === sel.origem_caixa_id)?.identificacao ?? 'outra caixa'}; ao confirmar, passa a vir desta.</Text> : null}
                {serve(sel) ? (
                  <Pressable style={s.usar} onPress={() => { escolher(sel); fechar(); }}>
                    <Icone nome={seguinte ? 'arrow-right-bold' : 'link-variant'} tamanho={18} cor="#fff" />
                    <Text style={s.usarTexto}>{seguinte ? `Saída ${modo.saida} vai para esta caixa` : 'Vem desta caixa'}</Text>
                  </Pressable>
                ) : <Text style={[s.aviso, { paddingHorizontal: 0 }]}>Esta caixa não tem saída cadastrada, então não pode ser a anterior.</Text>}
              </View>
            ) : <Text style={s.dica}>Toque num pin para ver a caixa. As linhas cinza são ligações já cadastradas.</Text>}
          </View>

          <Text style={s.secao}>MAIS PRÓXIMAS</Text>
          {itens.slice(0, 12).map((c) => (
            <Pressable key={c.id} style={[s.linha, c.id === selecionado && { borderColor: cores.primaria }]} onPress={() => setSelecionado(c.id)}>
              <View style={[s.bolinha, { width: 12, height: 12, borderRadius: 6, backgroundColor: serve(c) ? COR_TIPO[c.tipo ?? 'emenda'] ?? cores.primaria : '#B8C0CC' }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cores.texto, fontWeight: '700' }}>{c.identificacao}</Text>
                <Text style={s.selSub}>{rotuloPonto(c.tipo ?? 'emenda')}{c.saidas.length ? ` · ${c.saidas.length} saída(s)` : ' · sem saída'}</Text>
              </View>
              {c.distancia != null ? <Text style={{ color: cores.suave, fontWeight: '700' }}>{fmtKm(c.distancia)}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  topoTitulo: { color: '#fff', fontSize: 18, fontWeight: '800' },
  topoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  cartao: { backgroundColor: cores.cartao, borderRadius: 18, margin: 16, marginBottom: 0, overflow: 'hidden', paddingBottom: 12, ...sombra },
  vazio: { color: cores.suave, padding: 24, textAlign: 'center' },
  zoom: { position: 'absolute', right: 10, top: 10, gap: 8 },
  zoomBotao: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...sombra },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingTop: 10 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  legendaTexto: { fontSize: 12, color: cores.texto2 },
  aviso: { fontSize: 12, color: cores.alerta, paddingHorizontal: 14, paddingTop: 6 },
  dica: { fontSize: 12.5, color: cores.suave, paddingHorizontal: 14, paddingTop: 10 },
  selecao: { margin: 12, marginBottom: 0, padding: 12, borderRadius: 14, backgroundColor: '#F6F8FB', borderWidth: 1, borderColor: cores.borda },
  selTitulo: { fontSize: 16, fontWeight: '800', color: cores.texto },
  selSub: { fontSize: 12.5, color: cores.suave, marginTop: 2 },
  usar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, backgroundColor: cores.primaria, marginTop: 10 },
  usarTexto: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secao: { fontSize: 12, fontWeight: '700', color: cores.apagado, letterSpacing: 0.5, marginHorizontal: 16, marginTop: 18, marginBottom: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
});
