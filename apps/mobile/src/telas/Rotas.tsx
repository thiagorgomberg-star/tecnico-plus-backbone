import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, Text, View } from 'react-native';

import AnaliseSor from '../componentes/AnaliseSor';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, estilo, fundoDe } from '../lib/estilo';
import { supabase } from '../lib/supabase';

type Rota = { id: string; trecho: string; descricao: string | null; link_kmz: string; extensao_km: number | null };
type Curva = {
  rota_id: string; origem: 'arquivo' | 'campo'; tirada_em: string; bucket: string; caminho: string; nome: string;
  fibra: number | null; ponta: string | null; os_numero: number | null; total: number; ultima_em: string;
};
const CACHE = 'rotas-cache';
const CACHE_CURVAS = 'curvas-cache';
const DIAS_CURVA = 30;
const diasDesde = (iso: string) => Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);

// Por trecho: o KMZ (Google Drive) e as últimas curvas OTDR, com alerta quando passa de 30 dias sem curva nova.
export default function Rotas({ voltar }: { voltar: () => void }) {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [curvas, setCurvas] = useState<Curva[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [analise, setAnalise] = useState<(Curva & { extensaoKm: number | null; trecho: string }) | null>(null);

  function carregarCurvas() {
    supabase.rpc('curvas_trecho', { p_limite: 5 }).then(({ data }) => {
      if (!data) return;
      setCurvas(data as Curva[]);
      AsyncStorage.setItem(CACHE_CURVAS, JSON.stringify(data));
    });
  }

  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((c) => c && setRotas(JSON.parse(c)));
    AsyncStorage.getItem(CACHE_CURVAS).then((c) => c && setCurvas(JSON.parse(c)));
    supabase.from('rotas').select('id, trecho, descricao, link_kmz, extensao_km').eq('ativo', true).order('trecho').then(({ data }) => {
      if (!data) return;
      setRotas(data);
      AsyncStorage.setItem(CACHE, JSON.stringify(data));
    });
    carregarCurvas();
  }, []);

  async function abrirLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Não foi possível abrir o link', url);
    }
  }

  async function abrirCurva(c: Curva, rota: Rota) {
    if (/\.sor$/i.test(c.nome)) return setAnalise({ ...c, extensaoKm: rota.extensao_km, trecho: rota.trecho });
    const { data, error } = await supabase.storage.from(c.bucket).createSignedUrl(c.caminho, 600);
    if (error || !data) return Alert.alert('Sem internet', 'Para abrir a curva é preciso estar conectado.');
    abrirLink(data.signedUrl);
  }

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Rotas do backbone" subtitulo="KMZ e curvas OTDR por trecho" voltar={voltar} />
      <FlatList
        data={rotas}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={[estilo.suave, { margin: 16 }]}>Nenhum trecho disponível.</Text>}
        renderItem={({ item }) => {
          const lista = curvas.filter((c) => c.rota_id === item.id);
          const dias = lista[0] ? diasDesde(lista[0].ultima_em) : null;
          const atrasado = dias == null || dias > DIAS_CURVA;
          const corSit = atrasado ? cores.perigo : cores.sucesso;
          return (
            <View style={estilo.cartao}>
              <Text style={[estilo.titulo, { fontSize: 16 }]}>{item.trecho}</Text>
              {item.descricao ? <Text style={estilo.suave}>{item.descricao}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start',
                backgroundColor: fundoDe(corSit), borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Icone nome={atrasado ? 'alert' : 'check-circle'} tamanho={14} cor={corSit} />
                <Text style={{ color: corSit, fontSize: 12, fontWeight: '700' }}>
                  {dias == null ? 'Sem curvas OTDR' : atrasado ? `${dias} dias sem curva nova` : `Curva em dia (há ${dias} dia${dias === 1 ? '' : 's'})`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: 10 }}>
                {item.link_kmz ? (
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => abrirLink(item.link_kmz)}>
                    <Icone nome="map-marker-path" cor={cores.primaria} />
                    <Text style={{ color: cores.primaria, fontWeight: '600' }}>Abrir KMZ</Text>
                  </Pressable>
                ) : <Text style={{ color: cores.apagado, fontSize: 13 }}>KMZ ainda não cadastrado</Text>}
                {lista.length > 0 && (
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setAberta(aberta === item.id ? null : item.id)}>
                    <Icone nome="chart-bell-curve" cor={cores.primaria} />
                    <Text style={{ color: cores.primaria, fontWeight: '600' }}>Últimas curvas ({lista[0].total})</Text>
                  </Pressable>
                )}
              </View>
              {aberta === item.id && lista.map((c) => (
                <Pressable key={`${c.bucket}/${c.caminho}`} onPress={() => abrirCurva(c, item)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cores.borda, marginTop: 6 }}>
                  <Icone nome={c.origem === 'campo' ? 'camera' : 'file-chart'} cor={cores.suave} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: cores.texto }} numberOfLines={1}>{c.nome}</Text>
                    <Text style={estilo.suave}>
                      {new Date(c.tirada_em).toLocaleDateString('pt-BR')}
                      {c.fibra ? ` · FO ${c.fibra}` : ''}{c.ponta ? ` · ${c.ponta}` : ''}{c.os_numero ? ` · O.S. ${c.os_numero}` : ''}
                    </Text>
                  </View>
                  {/\.sor$/i.test(c.nome)
                    ? <Text style={{ color: cores.primaria, fontWeight: '700', fontSize: 12.5 }}>Analisar</Text>
                    : <Icone nome="chevron-right" cor={cores.suave} />}
                </Pressable>
              ))}
            </View>
          );
        }}
      />
      <AnaliseSor curva={analise} extensaoKm={analise?.extensaoKm ?? null} trecho={analise?.trecho} fechar={() => setAnalise(null)} />
    </View>
  );
}
