import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { Caixa, caixasDaRede, salvarCaixa } from '../lib/caixas';
import { cores } from '../lib/estilo';
import { calcularPlano, CAPACIDADES, CaixaRede, descreverFibra, herdarDaAnterior, Manobra, rotuloPonto, SituacaoFibra, TIPOS_PONTO } from '../lib/fusao';
import { aoMudarFila, itensPendentes } from '../lib/fila';
import { enderecoDe, posicaoAtual } from '../lib/localizacao';
import { supabase } from '../lib/supabase';
import CameraOS from './CameraOS';

type Props = {
  osId: string;
  caixa: Caixa | null;          // null: caixa nova
  daOs: Caixa[];                // caixas já lançadas nesta O.S. (sugestão de caixa anterior)
  podeEditar: boolean;
  usuario: { nome: string; cargo: string | null };
  voltar: () => void;
};

type Camera = { tipo: 'foto_caixa' | 'foto_otdr'; fibra?: number; titulo: string; feitas: number };

const numero = (t: string) => {
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && t.trim() !== '' ? n : null;
};

// Cadastro da caixa em campo: tipo, origem (caixa anterior ou DGO), localização, plano de fusão,
// manobras, clientes/sem potência por fibra (potência só nas pontas: DGO e entroncamento) e fotos.
export default function CaixaEmenda({ osId, caixa: inicial, daOs, podeEditar, usuario, voltar }: Props) {
  const [nova, setNova] = useState(!inicial);
  const ultima = daOs[daOs.length - 1];
  const [c, setC] = useState<Caixa>(() => inicial ?? {
    id: randomUUID(), os_id: osId, tipo: 'emenda', identificacao: '', capacidade_fibras: 72, saidas: [],
    grupos_fusionados: 0, grupos_vagos: 0, observacao: null, endereco: null, latitude: null, longitude: null,
    precisao_m: null, localizada_em: null, origem_caixa_id: null, origem_saida: null, origem_dgo: null, origem: null,
    manobras: [], fibras: [],
  });
  const [origemTipo, setOrigemTipo] = useState<'caixa' | 'dgo' | 'nenhuma'>(
    inicial ? (inicial.origem_caixa_id ? 'caixa' : inicial.origem_dgo ? 'dgo' : 'nenhuma') : ultima ? 'caixa' : 'nenhuma');
  const [rede, setRede] = useState<CaixaRede[]>([]);
  const [capturando, setCapturando] = useState(false);
  const [gruposEditados, setGruposEditados] = useState(!!inicial);
  const [manobra, setManobra] = useState({ entrada: '', saida: 1, fibra: '', motivo: '' });
  const [fibra, setFibra] = useState({ numero: '', cliente: '', semPotencia: false, potencia: '', reflexao: '', perda: '' });
  const [camera, setCamera] = useState<Camera | null>(null);
  // Fotos já tiradas: da caixa e da tela do OTDR por fibra (enviadas + na fila).
  const [fotos, setFotos] = useState<{ caixa: number; otdr: Record<number, number> }>({ caixa: 0, otdr: {} });
  const [salvando, setSalvando] = useState(false);
  const enderecoAuto = useRef('');
  const ehPonta = c.tipo === 'dgo' || c.tipo === 'entroncamento';

  const mudar = (campos: Partial<Caixa>) => setC((x) => ({ ...x, ...campos }));

  useEffect(() => {
    const contar = async () => {
      const otdr: Record<number, number> = {};
      let total = 0;
      const somar = (tipo: string, fibraN: number | null | undefined) => {
        if (tipo === 'foto_caixa') total++;
        if (tipo === 'foto_otdr' && fibraN) otdr[fibraN] = (otdr[fibraN] ?? 0) + 1;
      };
      for (const i of await itensPendentes()) if (i.tipo === 'foto' && i.caixaId === c.id) somar(i.tipoAnexo, i.fibra);
      const { data } = await supabase.from('os_anexos').select('tipo, fibra').eq('caixa_id', c.id);
      for (const a of data ?? []) somar(a.tipo, a.fibra);
      setFotos({ caixa: total, otdr });
    };
    contar();
    return aoMudarFila(contar);
  }, [c.id]);

  // Voltar do Android fecha só a caixa, não a O.S.
  useEffect(() => {
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      voltar();
      return true;
    });
    return () => assinatura.remove();
  }, [voltar]);

  useEffect(() => {
    caixasDaRede().then(setRede);
    if (nova) {
      capturar();
      if (ultima && ultima.saidas.length) escolherOrigem(ultima, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Caixas para escolher como anterior: as desta O.S. primeiro, depois as da rede.
  const candidatas = useMemo(() => {
    const ids = new Set(daOs.map((x) => x.id));
    return [...daOs, ...rede.filter((x) => !ids.has(x.id))].filter((x) => x.id !== c.id && x.saidas.length > 0);
  }, [daOs, rede, c.id]);
  const anterior = candidatas.find((x) => x.id === c.origem_caixa_id);

  function escolherOrigem(ant: CaixaRede, saida: number) {
    const herdado = herdarDaAnterior(ant, saida);
    setC((x) => ({
      ...x,
      origem_caixa_id: ant.id, origem_saida: saida, origem_dgo: null, origem: ant.identificacao,
      capacidade_fibras: CAPACIDADES.includes(herdado.capacidade) ? herdado.capacidade : x.capacidade_fibras,
      fibras: herdado.fibras,
    }));
  }

  async function capturar() {
    setCapturando(true);
    const pos = await posicaoAtual().catch(() => null);
    if (!pos) {
      setCapturando(false);
      return Alert.alert('Localização indisponível', 'Permita o acesso à localização e confira se o GPS está ligado.');
    }
    mudar({ latitude: pos.latitude, longitude: pos.longitude, precisao_m: pos.accuracy, localizada_em: new Date().toISOString() });
    const texto = (await enderecoDe(pos.latitude, pos.longitude, 5000)) ?? `Coordenadas ${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}`;
    setC((x) => {
      if (x.endereco?.trim() && x.endereco !== enderecoAuto.current) return x;
      enderecoAuto.current = texto;
      return { ...x, endereco: texto };
    });
    setCapturando(false);
  }

  const plano = calcularPlano(c);
  const grupos = gruposEditados ? { f: c.grupos_fusionados, v: c.grupos_vagos } : { f: plano.gruposFusionados, v: plano.gruposVagos };

  function adicionarManobra() {
    const entrada = numero(manobra.entrada);
    const fs = numero(manobra.fibra);
    if (!entrada || entrada > c.capacidade_fibras) return Alert.alert('Fibra de entrada inválida', `De 1 a ${c.capacidade_fibras}.`);
    const cap = c.saidas[manobra.saida - 1];
    if (!cap) return Alert.alert('Cadastre a saída antes da manobra');
    if (!fs || fs > cap) return Alert.alert('Fibra de saída inválida', `De 1 a ${cap}.`);
    const m: Manobra = { fibra_entrada: entrada, saida: manobra.saida, fibra_saida: fs, motivo: manobra.motivo.trim() || null };
    mudar({ manobras: [...c.manobras.filter((x) => x.fibra_entrada !== entrada), m].sort((a, b) => a.fibra_entrada - b.fibra_entrada) });
    setManobra({ ...manobra, entrada: '', fibra: '', motivo: '' });
  }

  function adicionarFibra() {
    const n = numero(fibra.numero);
    if (!n || n > c.capacidade_fibras) return Alert.alert('Fibra inválida', `De 1 a ${c.capacidade_fibras}.`);
    const potencia = ehPonta ? numero(fibra.potencia) : null;
    const reflexao = ehPonta ? numero(fibra.reflexao) : null;
    const perda = ehPonta ? numero(fibra.perda) : null;
    if (ehPonta && !fibra.semPotencia && (potencia == null || reflexao == null || perda == null)) {
      return Alert.alert('Medição do OTDR', 'Na ponta informe sinal (dBm), reflexão (dB) e perda (dB/km) da fibra, ou marque sem potência.');
    }
    if (!ehPonta && !fibra.cliente.trim() && !fibra.semPotencia) return Alert.alert('Informe o cliente ou marque sem potência');
    const f: SituacaoFibra = {
      fibra: n, cliente: fibra.cliente.trim() || null, sem_potencia: fibra.semPotencia,
      potencia_dbm: potencia, reflexao_db: reflexao, perda_db_km: perda,
    };
    mudar({ fibras: [...c.fibras.filter((x) => x.fibra !== n), f].sort((a, b) => a.fibra - b.fibra) });
    setFibra({ numero: '', cliente: '', semPotencia: false, potencia: '', reflexao: '', perda: '' });
  }

  async function salvar() {
    if (!c.identificacao.trim()) return Alert.alert('Informe a identificação', 'Ex.: CE-BKB-0006');
    if (origemTipo === 'dgo' && !c.origem_dgo?.trim()) return Alert.alert('Informe o DGO de origem');
    if (c.latitude == null && !(await new Promise<boolean>((ok) => Alert.alert('Sem localização', 'Salvar mesmo assim?', [
      { text: 'Capturar', onPress: () => ok(false) }, { text: 'Salvar', onPress: () => ok(true) }])))) return;
    setSalvando(true);
    const final: Caixa = {
      ...c,
      identificacao: c.identificacao.trim(),
      grupos_fusionados: grupos.f, grupos_vagos: grupos.v,
      origem_caixa_id: origemTipo === 'caixa' ? c.origem_caixa_id : null,
      origem_saida: origemTipo === 'caixa' ? c.origem_saida : null,
      origem_dgo: origemTipo === 'dgo' ? c.origem_dgo?.trim() || null : null,
      origem: origemTipo === 'caixa' ? anterior?.identificacao ?? c.origem : origemTipo === 'dgo' ? `DGO ${c.origem_dgo}` : null,
      fibras: ehPonta ? c.fibras : c.fibras.map((f) => ({ ...f, potencia_dbm: null, reflexao_db: null, perda_db_km: null })),
    };
    await salvarCaixa(final, nova);
    setC(final);
    setSalvando(false);
    if (nova) {
      setNova(false);
      Alert.alert('Caixa salva', ehPonta
        ? 'Agora tire as fotos da caixa e a foto da tela do OTDR de cada fibra medida.'
        : 'Agora tire as fotos da caixa.');
    } else voltar();
  }

  const chip = (ativo: boolean) => [s.chip, ativo && s.chipAtivo];
  const textoChip = (ativo: boolean) => [s.chipTexto, ativo && { color: '#fff' }];

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo={nova ? 'Nova caixa' : c.identificacao} subtitulo={rotuloPonto(c.tipo)} voltar={voltar} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }} pointerEvents={podeEditar ? 'auto' : 'none'}>
        <View style={s.bloco}>
          <Text style={s.rotulo}>TIPO</Text>
          <View style={s.chips}>
            {TIPOS_PONTO.map((t) => (
              <Pressable key={t.valor} style={chip(c.tipo === t.valor)} onPress={() => mudar({ tipo: t.valor })}>
                <Text style={textoChip(c.tipo === t.valor)}>{t.rotulo}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.rotulo}>IDENTIFICAÇÃO *</Text>
          <TextInput style={s.campo} value={c.identificacao} onChangeText={(t) => mudar({ identificacao: t })}
            autoCapitalize="characters" placeholder="Ex.: CE-BKB-0006" />
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>VEM DE</Text>
          <View style={s.chips}>
            {([['caixa', 'Caixa anterior'], ['dgo', 'DGO'], ['nenhuma', 'Não informar']] as const).map(([v, r]) => (
              <Pressable key={v} style={chip(origemTipo === v)} onPress={() => setOrigemTipo(v)}>
                <Text style={textoChip(origemTipo === v)}>{r}</Text>
              </Pressable>
            ))}
          </View>
          {origemTipo === 'dgo' ? (
            <TextInput style={s.campo} value={c.origem_dgo ?? ''} onChangeText={(t) => mudar({ origem_dgo: t })} placeholder="Nome do DGO / POP" />
          ) : null}
          {origemTipo === 'caixa' ? (
            candidatas.length === 0 ? <Text style={s.suave}>Nenhuma caixa com saída cadastrada ainda.</Text> : (
              <>
                <View style={s.chips}>
                  {candidatas.slice(0, 20).map((x) => (
                    <Pressable key={x.id} style={chip(c.origem_caixa_id === x.id)} onPress={() => escolherOrigem(x, 1)}>
                      <Text style={textoChip(c.origem_caixa_id === x.id)}>{x.identificacao}</Text>
                    </Pressable>
                  ))}
                </View>
                {anterior && anterior.saidas.length > 1 ? (
                  <View style={s.chips}>
                    {anterior.saidas.map((qtd, i) => (
                      <Pressable key={i} style={chip(c.origem_saida === i + 1)} onPress={() => escolherOrigem(anterior, i + 1)}>
                        <Text style={textoChip(c.origem_saida === i + 1)}>Saída {i + 1} · {qtd} FO</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {anterior ? (
                  <Text style={s.suave}>Entrada preenchida com a saída {c.origem_saida} de {anterior.identificacao}
                    {c.fibras.length ? `, com ${c.fibras.length} fibra(s) de cliente/sem potência` : ''}.</Text>
                ) : null}
              </>
            )
          ) : null}
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>LOCALIZAÇÃO</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, color: c.latitude != null ? cores.texto : cores.suave }}>
              {capturando ? 'Capturando...' : c.latitude != null
                ? `${c.latitude.toFixed(6)}, ${c.longitude!.toFixed(6)}${c.precisao_m != null ? ` · ±${Math.round(c.precisao_m)} m` : ''}`
                : 'Ainda não capturada'}
            </Text>
            <Pressable style={s.botaoPequeno} onPress={capturar} disabled={capturando}>
              {capturando ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.botaoPequenoTexto}>{c.latitude != null ? 'Capturar de novo' : 'Capturar localização'}</Text>}
            </Pressable>
          </View>
          <TextInput style={s.campo} value={c.endereco ?? ''} onChangeText={(t) => mudar({ endereco: t })} placeholder="Endereço (preenchido pelo GPS)" multiline />
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>PLANO DE FUSÃO · ENTRADA (FIBRAS)</Text>
          <View style={s.chips}>
            {CAPACIDADES.map((n) => (
              <Pressable key={n} style={chip(c.capacidade_fibras === n)} onPress={() => mudar({ capacidade_fibras: n })}>
                <Text style={textoChip(c.capacidade_fibras === n)}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.rotulo}>SAÍDAS</Text>
          {c.saidas.map((qtd, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontWeight: '600', color: cores.texto }}>Saída {i + 1}</Text>
                <Pressable onPress={() => mudar({ saidas: c.saidas.filter((_, k) => k !== i), manobras: c.manobras.filter((m) => m.saida !== i + 1) })}>
                  <Text style={{ color: cores.perigo }}>remover</Text>
                </Pressable>
              </View>
              <View style={s.chips}>
                {CAPACIDADES.map((n) => (
                  <Pressable key={n} style={chip(qtd === n)} onPress={() => mudar({ saidas: c.saidas.map((x, k) => (k === i ? n : x)) })}>
                    <Text style={textoChip(qtd === n)}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Pressable style={[s.botaoPequeno, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => mudar({ saidas: [...c.saidas, c.capacidade_fibras] })}>
            <Text style={s.botaoPequenoTexto}>+ Adicionar saída</Text>
          </Pressable>

          <Text style={[s.suave, { marginTop: 10 }]}>
            Cor com cor: {plano.ligacoes.length} fibras fusionadas · {plano.param} param nesta caixa · {c.manobras.length} manobra(s)
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>GRUPOS FUSIONADOS</Text>
              <TextInput style={s.campo} keyboardType="number-pad" value={String(grupos.f)}
                onChangeText={(t) => { setGruposEditados(true); mudar({ grupos_fusionados: numero(t) ?? 0, grupos_vagos: grupos.v }); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>GRUPOS VAGOS</Text>
              <TextInput style={s.campo} keyboardType="number-pad" value={String(grupos.v)}
                onChangeText={(t) => { setGruposEditados(true); mudar({ grupos_vagos: numero(t) ?? 0, grupos_fusionados: grupos.f }); }} />
            </View>
          </View>
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>MANOBRAS ({c.manobras.length})</Text>
          {c.manobras.map((m) => (
            <View key={m.fibra_entrada} style={s.linha}>
              <View style={{ flex: 1 }}>
                <Text style={s.texto}>{descreverFibra(m.fibra_entrada, c.capacidade_fibras)}</Text>
                <Text style={s.suave}>→ Saída {m.saida}: {descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras)}{m.motivo ? ` · ${m.motivo}` : ''}</Text>
              </View>
              <Pressable onPress={() => mudar({ manobras: c.manobras.filter((x) => x !== m) })}><Text style={{ color: cores.perigo }}>×</Text></Pressable>
            </View>
          ))}
          {c.saidas.length === 0 ? <Text style={s.suave}>Cadastre as saídas para lançar manobras.</Text> : (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.campo, { flex: 1 }]} keyboardType="number-pad" placeholder="Fibra entrada" value={manobra.entrada}
                  onChangeText={(t) => setManobra({ ...manobra, entrada: t })} />
                <TextInput style={[s.campo, { flex: 1 }]} keyboardType="number-pad" placeholder="Fibra saída" value={manobra.fibra}
                  onChangeText={(t) => setManobra({ ...manobra, fibra: t })} />
              </View>
              {c.saidas.length > 1 ? (
                <View style={s.chips}>
                  {c.saidas.map((qtd, i) => (
                    <Pressable key={i} style={chip(manobra.saida === i + 1)} onPress={() => setManobra({ ...manobra, saida: i + 1 })}>
                      <Text style={textoChip(manobra.saida === i + 1)}>Saída {i + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextInput style={s.campo} placeholder="Motivo (ex.: fibra quebrada no pé)" value={manobra.motivo}
                onChangeText={(t) => setManobra({ ...manobra, motivo: t })} />
              <Pressable style={[s.botaoPequeno, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={adicionarManobra}>
                <Text style={s.botaoPequenoTexto}>+ Lançar manobra</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>{ehPonta ? 'FIBRAS: CLIENTE, SINAL E SEM POTÊNCIA' : 'FIBRAS: CLIENTE E SEM POTÊNCIA'} ({c.fibras.length})</Text>
          {c.fibras.map((f) => (
            <View key={f.fibra} style={s.linha}>
              <View style={{ flex: 1 }}>
                <Text style={s.texto}>{descreverFibra(f.fibra, c.capacidade_fibras)}</Text>
                <Text style={[s.suave, f.sem_potencia && { color: cores.perigo, fontWeight: '700' }]}>
                  {[f.cliente, f.sem_potencia ? 'SEM POTÊNCIA' : null].filter(Boolean).join(' · ')}
                </Text>
                {ehPonta && !f.sem_potencia ? (
                  <Text style={s.suave}>
                    Sinal {f.potencia_dbm ?? '—'} dBm · Reflexão {f.reflexao_db ?? '—'} dB · Perda {f.perda_db_km ?? '—'} dB/km
                  </Text>
                ) : null}
                {ehPonta && !f.sem_potencia ? (
                  <Pressable disabled={nova} onPress={() => setCamera({ tipo: 'foto_otdr', fibra: f.fibra, titulo: `OTDR · fibra ${f.fibra}`, feitas: fotos.otdr[f.fibra] ?? 0 })}>
                    <Text style={{ color: fotos.otdr[f.fibra] ? cores.sucesso : nova ? cores.suave : cores.perigo, fontWeight: '700', marginTop: 4 }}>
                      {fotos.otdr[f.fibra] ? `✓ Foto do OTDR (${fotos.otdr[f.fibra]}) · tirar outra` : nova ? 'Foto do OTDR: salve a caixa primeiro' : '📷 Falta a foto do OTDR · tirar'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => mudar({ fibras: c.fibras.filter((x) => x !== f) })}><Text style={{ color: cores.perigo }}>×</Text></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.campo, { width: 90 }]} keyboardType="number-pad" placeholder="Fibra" value={fibra.numero}
              onChangeText={(t) => setFibra({ ...fibra, numero: t })} />
            <TextInput style={[s.campo, { flex: 1 }]} placeholder="Cliente" value={fibra.cliente} onChangeText={(t) => setFibra({ ...fibra, cliente: t })} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }} />
            <Text style={s.texto}>Sem potência</Text>
            <Switch value={fibra.semPotencia} onValueChange={(v) => setFibra({ ...fibra, semPotencia: v })} />
          </View>
          {ehPonta ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder="Sinal dBm"
                value={fibra.potencia} onChangeText={(t) => setFibra({ ...fibra, potencia: t })} />
              <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder="Reflexão dB"
                value={fibra.reflexao} onChangeText={(t) => setFibra({ ...fibra, reflexao: t })} />
              <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder="Perda dB/km"
                value={fibra.perda} onChangeText={(t) => setFibra({ ...fibra, perda: t })} />
            </View>
          ) : null}
          <Pressable style={[s.botaoPequeno, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={adicionarFibra}>
            <Text style={s.botaoPequenoTexto}>+ Lançar fibra</Text>
          </Pressable>
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>OBSERVAÇÃO</Text>
          <TextInput style={[s.campo, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={c.observacao ?? ''}
            onChangeText={(t) => mudar({ observacao: t })} />
          {!nova ? (
            <Pressable style={[s.botao, { backgroundColor: cores.primaria }]}
              onPress={() => setCamera({ tipo: 'foto_caixa', titulo: c.identificacao, feitas: fotos.caixa })}>
              <Text style={s.botaoTexto}>Fotos da caixa ({fotos.caixa})</Text>
            </Pressable>
          ) : <Text style={s.suave}>Depois de salvar, tire as fotos da caixa{ehPonta ? ' e do OTDR' : ''}.</Text>}
        </View>
      </ScrollView>
      <Modal visible={!!camera} onRequestClose={() => setCamera(null)} animationType="fade" supportedOrientations={['landscape', 'portrait']}>
        {camera ? (
          <CameraOS osId={osId} fotosJaFeitas={camera.feitas} minimo={camera.tipo === 'foto_otdr' ? 1 : 2} usuario={usuario}
            caixa={{ id: c.id, tipo: camera.tipo, fibra: camera.fibra, titulo: camera.titulo }} fechar={() => setCamera(null)} />
        ) : null}
      </Modal>
      {podeEditar ? (
        <View style={s.rodape}>
          <Pressable style={[s.botao, { backgroundColor: cores.sucesso, marginTop: 0 }]} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>Salvar caixa</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { backgroundColor: cores.cartao, borderBottomWidth: 1, borderBottomColor: cores.borda, padding: 14 },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.suave, letterSpacing: 0.5, marginTop: 10, marginBottom: 2 },
  texto: { fontSize: 15, color: cores.texto },
  suave: { fontSize: 13, color: cores.suave, marginTop: 4 },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 6, padding: 10, fontSize: 15, backgroundColor: '#fff', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#fff' },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.texto, fontSize: 14 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: cores.borda },
  botaoPequeno: { backgroundColor: cores.primaria, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  botaoPequenoTexto: { color: '#fff', fontWeight: '700' },
  botao: { borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rodape: { backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda, padding: 12 },
});
