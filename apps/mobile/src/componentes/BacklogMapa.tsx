import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { ItemBacklog } from '../lib/backlog';
import { cores, sombra } from '../lib/estilo';
import { idadeOs } from '../lib/formato';
import { distanciaKm, navegarAte } from '../lib/navegacao';
import Icone from './Icone';
import MapaVetorial from './MapaVetorial';

type Item = ItemBacklog & { distancia: number | null };
const ALTURA = 340;
const MARGEM = 28;

// Mapa do backlog com ruas de fundo guardadas no celular (sem o fundo, usa o desenho próprio do app): pins pela posição, cor pela idade, você em azul.
// Ajuda a juntar numa mesma saída as O.S. próximas umas das outras.
export default function BacklogMapa({ itens, posicao, abrir, exportar }: {
  itens: Item[]; posicao: { lat: number; lng: number } | null; abrir: (id: string) => void; exportar: () => void;
}) {
  const { width } = useWindowDimensions();
  const largura = Math.min(width, 600) - 32;
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const comLocal = itens.filter((b) => b.lat != null && b.lng != null);

  const projecao = useMemo(() => {
    const pontos = [...comLocal.map((b) => ({ lat: b.lat!, lng: b.lng! })), ...(posicao ? [posicao] : [])];
    if (!pontos.length) return null;
    const lats = pontos.map((p) => p.lat), lngs = pontos.map((p) => p.lng);
    const latMeio = (Math.min(...lats) + Math.max(...lats)) / 2;
    const fx = Math.cos((latMeio * Math.PI) / 180);
    // Em km a partir do canto; no mínimo 2 km de lado para um ponto só não ocupar a tela toda.
    const kmX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 111.32 * fx, 2);
    const kmY = Math.max((Math.max(...lats) - Math.min(...lats)) * 110.57, 2);
    const escala = Math.min((largura - 2 * MARGEM) / kmX, (ALTURA - 2 * MARGEM) / kmY);
    const cx = (Math.min(...lngs) + Math.max(...lngs)) / 2, cy = latMeio;
    const xy = (p: { lat: number; lng: number }) => ({
      x: largura / 2 + (p.lng - cx) * 111.32 * fx * escala,
      y: ALTURA / 2 - (p.lat - cy) * 110.57 * escala,
    });
    // Barra de escala com um valor redondo de até ~1/4 da largura.
    const alvo = largura / 4 / escala;
    const passo = [...[0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]].reverse().find((v) => v <= alvo) ?? 0.5;
    return { xy, escala, passo };
  }, [comLocal, posicao, largura]);

  const sel = comLocal.find((b) => b.id === selecionado) ?? null;
  // O.S. a até 5 km da selecionada: candidatas a atender na mesma saída.
  const vizinhas = sel ? comLocal.filter((b) => b.id !== sel.id && distanciaKm({ lat: sel.lat!, lng: sel.lng! }, { lat: b.lat!, lng: b.lng! }) <= 5) : [];

  return (
    <View style={s.cartao}>
      {!projecao ? (
        <Text style={s.vazio}>Nenhuma O.S. do backlog tem localização.</Text>
      ) : (
        <MapaVetorial
          altura={ALTURA}
          aqui={posicao}
          enquadrar={[...comLocal.map((b) => ({ lat: b.lat!, lng: b.lng! })), ...(posicao ? [posicao] : [])]}
          foco={sel ? { lat: sel.lat!, lng: sel.lng! } : null}
          tocar={setSelecionado}
          pontos={comLocal.map((b) => ({
            id: b.id, lat: b.lat!, lng: b.lng!, rotulo: `#${b.numero}`, ativo: b.id === selecionado, cor: idadeOs(b.criado_em).cor,
            contorno: '#FFFFFF', marca: b.prioridade === 'alta' || b.prioridade === 'emergencia' ? '!' : '',
          }))}
          linhas={sel ? vizinhas.map((v) => ({ id: v.id, de: { lat: sel.lat!, lng: sel.lng! }, para: { lat: v.lat!, lng: v.lng! }, cor: cores.primaria, tracejada: true })) : []}
          reserva={
        <Svg width={largura} height={ALTURA}>
          <Rect x={0} y={0} width={largura} height={ALTURA} fill="#EEF3F8" rx={14} />
          {Array.from({ length: 7 }, (_, i) => (
            <G key={i}>
              <Line x1={(largura / 6) * i} y1={0} x2={(largura / 6) * i} y2={ALTURA} stroke="#DCE4EE" strokeWidth={1} />
              <Line x1={0} y1={(ALTURA / 6) * i} x2={largura} y2={(ALTURA / 6) * i} stroke="#DCE4EE" strokeWidth={1} />
            </G>
          ))}
          {sel ? vizinhas.map((v) => {
            const a = projecao.xy({ lat: sel.lat!, lng: sel.lng! }), b = projecao.xy({ lat: v.lat!, lng: v.lng! });
            return <Line key={v.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={cores.primaria} strokeWidth={2} strokeDasharray="5,4" />;
          }) : null}
          {comLocal.map((b) => {
            const { x, y } = projecao.xy({ lat: b.lat!, lng: b.lng! });
            const idade = idadeOs(b.criado_em);
            const ativo = b.id === selecionado;
            return (
              <G key={b.id} onPress={() => setSelecionado(b.id)}>
                <Circle cx={x} cy={y} r={ativo ? 15 : 12} fill={idade.cor} stroke="#fff" strokeWidth={ativo ? 4 : 2.5} />
                {b.prioridade === 'alta' || b.prioridade === 'emergencia'
                  ? <SvgText x={x} y={y + 4.5} fontSize={13} fontWeight="bold" fill="#fff" textAnchor="middle">!</SvgText> : null}
                <SvgText x={x} y={y - 18} fontSize={11} fontWeight="bold" fill={cores.texto} textAnchor="middle">#{b.numero}</SvgText>
              </G>
            );
          })}
          {posicao ? (() => {
            const { x, y } = projecao.xy(posicao);
            return (
              <G>
                <Circle cx={x} cy={y} r={16} fill="rgba(31,111,209,0.18)" />
                <Circle cx={x} cy={y} r={7} fill="#1F6FD1" stroke="#fff" strokeWidth={2.5} />
              </G>
            );
          })() : null}
          <Line x1={12} y1={ALTURA - 14} x2={12 + projecao.passo * projecao.escala} y2={ALTURA - 14} stroke={cores.texto2} strokeWidth={3} />
          <SvgText x={12} y={ALTURA - 20} fontSize={11} fill={cores.texto2}>{projecao.passo < 1 ? `${projecao.passo * 1000} m` : `${projecao.passo} km`}</SvgText>
          <SvgText x={largura - 12} y={ALTURA - 12} fontSize={13} fontWeight="bold" fill={cores.suave} textAnchor="end">N ↑</SvgText>
        </Svg>
          } />
      )}

      <View style={s.legenda}>
        {[['#1E9E4A', 'até 24h'], ['#D99A00', '24–48h'], ['#D0453B', '48h+'], ['#1F6FD1', 'você']].map(([c, t]) => (
          <View key={t} style={s.legendaItem}><View style={[s.bolinha, { backgroundColor: c }]} /><Text style={s.legendaTexto}>{t}</Text></View>
        ))}
      </View>
      {comLocal.length < itens.length ? <Text style={s.aviso}>{itens.length - comLocal.length} O.S. sem localização ficam só na lista.</Text> : null}

      {sel ? (
        <View style={s.selecao}>
          <Text style={s.selTitulo} numberOfLines={1}>#{sel.numero} · {sel.titulo}</Text>
          <Text style={s.selSub}>
            {sel.distancia != null ? `${sel.distancia.toFixed(1).replace('.', ',')} km de você · ` : ''}aberta há {idadeOs(sel.criado_em).texto}
            {vizinhas.length ? ` · ${vizinhas.length} O.S. a até 5 km (tracejado)` : ''}
          </Text>
          <View style={s.botoes}>
            <Pressable style={[s.botao, { backgroundColor: cores.selecionado }]} onPress={() => navegarAte(sel, `Ir até a O.S. #${sel.numero}`)}>
              <Icone nome="navigation-variant-outline" tamanho={18} cor={cores.primaria} />
              <Text style={[s.botaoTexto, { color: cores.primaria }]}>Rota</Text>
            </Pressable>
            <Pressable style={[s.botao, { backgroundColor: cores.primaria }]} onPress={() => abrir(sel.id)}>
              <Icone nome="file-document-outline" tamanho={18} cor="#fff" />
              <Text style={[s.botaoTexto, { color: '#fff' }]}>Ver detalhes</Text>
            </Pressable>
          </View>
        </View>
      ) : <Text style={s.dica}>Toque num pin para ver a O.S. e as que estão perto dela.</Text>}

      <Pressable style={s.exportar} onPress={exportar}>
        <Icone nome="google-earth" tamanho={18} cor={cores.primaria} />
        <Text style={s.exportarTexto}>Abrir no Google Earth / mapa offline (KMZ)</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: 18, marginHorizontal: 16, marginTop: 12, padding: 0, overflow: 'hidden', ...sombra },
  vazio: { color: cores.suave, padding: 24, textAlign: 'center' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingTop: 10 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  legendaTexto: { fontSize: 12, color: cores.texto2 },
  aviso: { fontSize: 12, color: cores.alerta, paddingHorizontal: 14, paddingTop: 6 },
  dica: { fontSize: 12.5, color: cores.suave, paddingHorizontal: 14, paddingTop: 10 },
  selecao: { margin: 12, marginBottom: 0, padding: 12, borderRadius: 14, backgroundColor: '#F6F8FB', borderWidth: 1, borderColor: cores.borda },
  selTitulo: { fontSize: 15, fontWeight: '800', color: cores.texto },
  selSub: { fontSize: 12.5, color: cores.suave, marginTop: 3 },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  botao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 12 },
  botaoTexto: { fontSize: 14, fontWeight: '700' },
  exportar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  exportarTexto: { fontSize: 13.5, fontWeight: '700', color: cores.primaria },
});
