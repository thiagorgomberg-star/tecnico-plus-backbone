import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DetalheBacklog as Detalhe, detalheBacklog, ItemBacklog } from '../lib/backlog';
import { cores, sombra } from '../lib/estilo';
import { idadeOs, textoSla } from '../lib/formato';
import { navegarAte } from '../lib/navegacao';
import FotosReferencia from './FotosReferencia';
import Icone, { iconeDoTipo } from './Icone';
import MargemInferior from './MargemInferior';

const PRIORIDADE = { emergencia: 'Emergência', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const quando = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;

type Props = {
  b: (ItemBacklog & { distancia: number | null }) | null;
  fechar: () => void;
  assumir: (b: ItemBacklog) => void;
  ocupado: boolean;
};

// Tudo sobre uma O.S. do backlog antes de assumir: ticket, endereço, quem abriu, descrição e fotos da abertura.
export default function DetalheBacklog({ b, fechar, assumir, ocupado }: Props) {
  const [extra, setExtra] = useState<Detalhe | null>(null);

  useEffect(() => {
    setExtra(null);
    if (b) detalheBacklog(b.id, setExtra).catch(() => {});
  }, [b?.id]);

  if (!b) return null;
  const temLocal = (b.lat != null && b.lng != null) || !!b.endereco;
  const idade = idadeOs(b.criado_em);
  const sla = b.sla_limite ? textoSla(b.sla_limite) : null;
  const ponto = extra?.ponto;
  const linhas: [string, string | null | undefined][] = [
    ['Ticket de acionamento', b.ticket_acionamento],
    ['Tipo', b.tipo],
    ['Prioridade', PRIORIDADE[b.prioridade]],
    ['Aberta em', quando(b.criado_em)],
    ['Aberta por', extra?.criada_por],
    ['Informada por', extra?.informado_por && extra.informado_por !== extra.criada_por ? extra.informado_por : null],
    ['Trecho', extra?.trecho ? `${extra.trecho}${extra.regiao ? ` · ${extra.regiao}` : ''}` : null],
    ['Prazo', quando(extra?.prazo)],
    ['Endereço', b.endereco],
    ['Coordenadas', b.lat != null && b.lng != null ? `${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}` : null],
    ['Distância de você', b.distancia != null ? `${b.distancia.toFixed(1).replace('.', ',')} km` : null],
    ['Localizada em', extra?.evento_localizado_em
      ? `${quando(extra.evento_localizado_em)}${extra.evento_precisao_m != null ? ` · precisão ${Math.round(extra.evento_precisao_m)} m` : ''}` : null],
    ['Origem', ponto ? `Vistoria · ${ponto.categoria === 'poste' ? `poste ${ponto.identificacao ?? ''}` : ponto.ocorrencia ?? ponto.categoria}${ponto.via ? ` · ${ponto.via}` : ''}` : null],
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={fechar}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Pressable onPress={fechar} hitSlop={12} accessibilityLabel="Voltar"><Icone nome="arrow-left" tamanho={24} cor="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topoTitulo}>O.S. #{b.numero}</Text>
            <Text style={s.topoSub}>Backlog · {b.tipo}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
          <View style={s.cartao}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={s.icone}><Icone nome={iconeDoTipo(b.tipo)} tamanho={22} cor="#fff" /></View>
              <Text style={s.titulo}>{b.titulo}</Text>
            </View>
            <View style={s.selos}>
              {sla ? (
                <View style={[s.selo, { backgroundColor: sla.nivel === 'ok' ? '#E7F6EC' : '#FDECEC' }]}>
                  <Text style={[s.seloTexto, { color: sla.nivel === 'ok' ? cores.sucesso : cores.perigo }]}>{sla.texto}</Text>
                </View>
              ) : (
                <View style={[s.selo, { backgroundColor: `${idade.cor}1F` }]}>
                  <View style={[s.bolinha, { backgroundColor: idade.cor }]} />
                  <Text style={[s.seloTexto, { color: idade.cor }]}>Aberta há {idade.texto}</Text>
                </View>
              )}
              <View style={[s.selo, { backgroundColor: '#F2F4F7' }]}>
                <Text style={[s.seloTexto, { color: cores.texto }]}>Prioridade {PRIORIDADE[b.prioridade].toLowerCase()}</Text>
              </View>
              {b.reservada ? (
                <View style={[s.selo, { backgroundColor: cores.selecionado }]}>
                  <Text style={[s.seloTexto, { color: cores.primaria }]}>Reservada p/ você</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={s.cartao}>
            <Text style={s.rotulo}>INFORMAÇÕES</Text>
            {linhas.filter(([, v]) => v).map(([r, v]) => (
              <View key={r} style={s.linha}>
                <Text style={s.linhaRotulo}>{r}</Text>
                <Text style={s.linhaValor} selectable>{v}</Text>
              </View>
            ))}
            {!extra ? <ActivityIndicator style={{ marginTop: 8 }} color={cores.apagado} /> : null}
          </View>

          {b.descricao || ponto?.observacao || extra?.observacao_supervisor ? (
            <View style={s.cartao}>
              <Text style={s.rotulo}>DESCRIÇÃO</Text>
              {b.descricao ? <Text style={s.texto} selectable>{b.descricao}</Text> : null}
              {ponto?.observacao ? <Text style={[s.texto, { marginTop: 8 }]}>Vistoria: {ponto.observacao}</Text> : null}
              {extra?.observacao_supervisor ? <Text style={[s.texto, { marginTop: 8 }]}>Supervisor: {extra.observacao_supervisor}</Text> : null}
            </View>
          ) : null}

          <FotosReferencia osId={b.id} />
        </ScrollView>

        <View style={s.rodape}>
          <Pressable style={[s.botao, { backgroundColor: cores.selecionado }]} disabled={!temLocal}
            onPress={() => navegarAte(b, `Ir até a O.S. #${b.numero}`)}>
            <Icone nome="navigation-variant-outline" tamanho={20} cor={temLocal ? cores.primaria : cores.apagado} />
            <Text style={[s.botaoTexto, { color: temLocal ? cores.primaria : cores.apagado }]}>Rota</Text>
          </Pressable>
          <Pressable style={[s.botao, { backgroundColor: cores.sucesso, flex: 1.6 }]} disabled={ocupado} onPress={() => assumir(b)}>
            {ocupado ? <ActivityIndicator color="#fff" /> : (
              <>
                <Icone nome="hand-back-right-outline" tamanho={20} cor="#fff" />
                <Text style={[s.botaoTexto, { color: '#fff' }]}>Assumir e atender</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
      <MargemInferior />
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  topoTitulo: { color: '#fff', fontSize: 19, fontWeight: '800' },
  topoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  cartao: { backgroundColor: cores.cartao, borderRadius: 18, padding: 14, ...sombra },
  icone: { width: 42, height: 42, borderRadius: 21, backgroundColor: cores.alerta, alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, fontSize: 17, fontWeight: '800', color: cores.texto },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  seloTexto: { fontSize: 12.5, fontWeight: '700' },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  rotulo: { fontSize: 11.5, fontWeight: '700', color: cores.suave, letterSpacing: 0.6, marginBottom: 6 },
  linha: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  linhaRotulo: { fontSize: 12, color: cores.suave },
  linhaValor: { fontSize: 15, color: cores.texto, marginTop: 1 },
  texto: { fontSize: 15, color: cores.texto, lineHeight: 21 },
  rodape: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 20, backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda },
  botao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14 },
  botaoTexto: { fontSize: 15, fontWeight: '700' },
});
