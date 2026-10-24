import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone, { NomeIcone } from '../componentes/Icone';
import { VERSAO_APP } from '../lib/atualizacao';
import { cores, fundoDe } from '../lib/estilo';
import { Tema, TEMAS, temaAtual, trocarTema } from '../lib/tema';
import { descreverVeiculo, MeuVeiculo, meuVeiculo } from '../lib/veiculo';

type Destino = 'preventiva' | 'escala' | 'rotas' | 'despesas' | 'frota' | 'inventario';
type Props = { nome: string; cargo: string | null; pendentes: number; abrir: (d: Destino) => void; sair: () => void };

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'T';

export default function Mais({ nome, cargo, pendentes, abrir, sair }: Props) {
  const [veiculo, setVeiculo] = useState<MeuVeiculo | null>(null);
  useEffect(() => {
    meuVeiculo(false).then(setVeiculo);
    meuVeiculo().then(setVeiculo).catch(() => undefined);
  }, []);
  const item = (icone: NomeIcone, rotulo: string, detalhe: string, acao: () => void, cor: string = cores.primaria) => (
    <Pressable style={({ pressed }) => [s.item, pressed && { backgroundColor: cores.selecionado }]} onPress={acao}>
      <View style={[s.itemIcone, { backgroundColor: fundoDe(cor) }]}>
        <Icone nome={icone} tamanho={22} cor={cor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rotulo, cor === cores.perigo && { color: cor }]}>{rotulo}</Text>
        {detalhe ? <Text style={s.detalhe}>{detalhe}</Text> : null}
      </View>
      <Icone nome="chevron-right" tamanho={22} cor="#B9B4AF" />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo="Menu" />
      <ScrollView>
        <View style={s.perfil}>
          <View style={s.avatar}><Text style={s.avatarTexto}>{iniciais(nome)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.nome} numberOfLines={1}>{nome || 'Técnico'}</Text>
            <Text style={s.detalhe}>{cargo ?? 'Técnico de campo'} · Multivale Backbone</Text>
            {veiculo ? <Text style={[s.detalhe, { color: cores.texto, fontWeight: '600' }]}>Veículo: {descreverVeiculo(veiculo)}</Text> : null}
          </View>
        </View>
        <Text style={s.secao}>CAMPO</Text>
        {item('shield-plus-outline', 'Iniciar preventiva', 'Abrir uma preventiva no local, com o expediente iniciado', () => abrir('preventiva'), cores.sucesso)}
        {item('toolbox-outline', 'Inventário Matinal', 'Foto de cada ferramenta e EPI a cada 30 dias', () => abrir('inventario'), '#7A5AA6')}
        {item('car-outline', 'Frota', 'Meu veículo: abastecimento, pedágio e manutenção', () => abrir('frota'), '#227E9E')}
        {item('receipt-text-outline', 'Despesas', 'Ferramentas, material, alimentação: foto do comprovante e valores', () => abrir('despesas'), cores.alerta)}
        {item('calendar-month-outline', 'Minha escala', 'Jornada, plantão e folgas do mês', () => abrir('escala'))}
        {item('map-outline', 'Rotas KMZ', 'Trechos do backbone para abrir no Google Earth', () => abrir('rotas'), '#227E9E')}
        <Text style={s.secao}>APARÊNCIA</Text>
        <View style={s.temas}>
          {(Object.keys(TEMAS) as Tema[]).map((t) => {
            const ativo = t === temaAtual();
            return (
              <Pressable key={t} style={[s.tema, ativo && { borderColor: TEMAS[t].cabecalho }]} disabled={ativo} onPress={() => trocarTema(t)}>
                <View style={[s.temaCor, { backgroundColor: TEMAS[t].cabecalho }]}>
                  {ativo ? <Icone nome="check" tamanho={18} cor="#fff" /> : null}
                </View>
                <Text style={[s.temaRotulo, ativo && { fontWeight: '700' }]}>{TEMAS[t].rotulo}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.secao}>CONTA</Text>
        {item('logout', 'Sair', pendentes > 0 ? `${pendentes} registro(s) ainda não enviados` : '', sair, cores.perigo)}
        <Text style={s.versao}>Técnico Plus · versão {VERSAO_APP || 'desenvolvimento'}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  perfil: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cartao, padding: 16, borderBottomWidth: 1, borderBottomColor: cores.borda },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: '#fff', fontSize: 19, fontWeight: '700' },
  nome: { fontSize: 17, fontWeight: '700', color: cores.texto },
  secao: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginHorizontal: 16, marginTop: 18, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.cartao, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: cores.linha },
  itemIcone: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rotulo: { fontSize: 16, fontWeight: '600', color: cores.texto },
  detalhe: { fontSize: 13, color: cores.suave, marginTop: 2 },
  temas: { flexDirection: 'row', gap: 10, backgroundColor: cores.cartao, padding: 12, borderBottomWidth: 1, borderBottomColor: cores.borda },
  tema: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: cores.linha },
  temaCor: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  temaRotulo: { fontSize: 13, color: cores.texto },
  versao: { textAlign: 'center', color: cores.suave, fontSize: 12, marginVertical: 24 },
});
