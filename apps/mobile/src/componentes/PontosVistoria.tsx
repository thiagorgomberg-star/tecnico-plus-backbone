import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../lib/estilo';
import { ESTADOS_BASE, OCORRENCIAS, PontoVistoria, pontosDaOs, rotuloDe, TIPOS_VIA } from '../lib/vistoria';

// Postes e ocorrências lançados na Vistoria Backbone MG, com o resumo do que já foi feito.
export default function PontosVistoria({ osId, podeEditar, versao, abrir }: {
  osId: string; podeEditar: boolean; versao: number;
  abrir: (ponto: PontoVistoria | null, categoria: 'poste' | 'ocorrencia', daOs: PontoVistoria[]) => void;
}) {
  const [pontos, setPontos] = useState<PontoVistoria[]>([]);

  useEffect(() => {
    pontosDaOs(osId, setPontos);
  }, [osId, versao]);

  const postes = pontos.filter((p) => p.categoria === 'poste');
  const troca = postes.filter((p) => p.precisa_troca).length;
  const ocorrencias = pontos.length - postes.length;

  return (
    <View>
      <View style={s.resumo}>
        <Numero valor={postes.length} rotulo="postes" />
        <Numero valor={troca} rotulo="para trocar" cor={troca ? cores.perigo : undefined} />
        <Numero valor={ocorrencias} rotulo="ocorrências" cor={ocorrencias ? cores.alerta : undefined} />
      </View>
      {podeEditar ? (
        <View style={s.botoes}>
          <Pressable style={[s.botao, { backgroundColor: cores.primaria }]} onPress={() => abrir(null, 'poste', pontos)}>
            <Text style={s.botaoTexto}>+ Poste</Text>
          </Pressable>
          <Pressable style={[s.botao, { backgroundColor: cores.alerta }]} onPress={() => abrir(null, 'ocorrencia', pontos)}>
            <Text style={s.botaoTexto}>+ Ocorrência</Text>
          </Pressable>
        </View>
      ) : null}
      {pontos.length === 0 ? (
        <View style={s.bloco}><Text style={s.suave}>Nenhum poste ou ocorrência lançado nesta vistoria.</Text></View>
      ) : null}
      {[...pontos].reverse().map((p) => {
        const poste = p.categoria === 'poste';
        return (
          <Pressable key={p.id} style={s.bloco} onPress={() => abrir(p, p.categoria, pontos)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.titulo, { flex: 1 }]}>{poste ? `Poste ${p.identificacao ?? ''}` : rotuloDe(OCORRENCIAS, p.ocorrencia)}</Text>
              {poste && p.precisa_troca ? <Text style={[s.selo, { color: cores.perigo, backgroundColor: `${cores.perigo}1F` }]}>Trocar</Text> : null}
              {!poste && p.gravidade === 'alta' ? <Text style={[s.selo, { color: cores.perigo, backgroundColor: `${cores.perigo}1F` }]}>Alta</Text> : null}
            </View>
            <Text style={s.suave}>
              {poste ? `${rotuloDe(ESTADOS_BASE, p.estado_base)}${p.inclinado ? ' · inclinado' : ''}${p.rachado ? ' · rachado' : ''} · ` : ''}
              {rotuloDe(TIPOS_VIA, p.tipo_via)}{p.via_nome ? ` · ${p.via_nome}` : ''}
            </Text>
            {p.latitude == null ? <Text style={[s.suave, { color: cores.perigo }]}>Sem localização</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Numero({ valor, rotulo, cor }: { valor: number; rotulo: string; cor?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[s.numero, cor ? { color: cor } : null]}>{valor}</Text>
      <Text style={s.suave}>{rotulo}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  resumo: { flexDirection: 'row', backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, paddingVertical: 12 },
  numero: { fontSize: 26, fontWeight: '700', color: cores.texto },
  botoes: { flexDirection: 'row', gap: 10, padding: 14 },
  botao: { flex: 1, borderRadius: 6, paddingVertical: 13, alignItems: 'center' },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  suave: { fontSize: 13, color: cores.suave, marginTop: 3 },
  selo: { fontSize: 12, fontWeight: '700', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
