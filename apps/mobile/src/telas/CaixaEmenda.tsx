import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import { Caixa, caixasDaRede, PREFIXO_TAG, proximaTag, salvarCaixa } from '../lib/caixas';
import { cores } from '../lib/estilo';
import {
  calcularPlano, CAPACIDADES, CaixaRede, descreverFibra, Destino, origemNaoCadastrada, TIPOS_DESTINO, faixasDaBandeja, FUSOES_POR_BANDEJA, herdarDaAnterior, Manobra, PADROES_CORES, rotuloPonto,
  descreverOlt, ehPonta, instalacoesDoTipo, MODELOS_OLT, TIPOS_SFP, TIPOS_CORDAO, separarBandejas, SituacaoFibra, TIPOS_PONTO,
} from '../lib/fusao';
import { aoMudarFila, enfileirar, itensPendentes } from '../lib/fila';
import { enderecoDe, posicaoAtual } from '../lib/localizacao';
import { supabase } from '../lib/supabase';
import Icone from '../componentes/Icone';
import MapaCaixas from '../componentes/MapaCaixas';
import CameraOS from './CameraOS';

type Props = {
  osId: string;
  caixa: Caixa | null;          // null: caixa nova
  daOs: Caixa[];                // caixas já lançadas nesta O.S. (sugestão de caixa anterior)
  podeEditar: boolean;
  usuario: { nome: string; cargo: string | null };
  voltar: () => void;
};

type Camera = { tipo: 'foto_caixa' | 'foto_otdr' | 'foto_bandeja' | 'foto_olt'; fibra?: number; bandeja?: number; titulo: string; feitas: number };

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
    id: randomUUID(), os_id: osId, tipo: 'emenda', identificacao: '', capacidade_fibras: 0, saidas: [],
    grupos_fusionados: 0, grupos_vagos: 0, observacao: null, endereco: null, latitude: null, longitude: null,
    precisao_m: null, localizada_em: null, origem_caixa_id: null, origem_saida: null, origem_dgo: null, origem: null,
    manobras: [], fibras: [], fusoes_por_bandeja: null,
  });
  const [origemTipo, setOrigemTipo] = useState<'caixa' | 'dgo' | 'nenhuma'>(
    inicial ? (inicial.origem_caixa_id ? 'caixa' : inicial.origem_dgo ? 'dgo' : 'nenhuma') : ultima ? 'caixa' : 'nenhuma');
  const [rede, setRede] = useState<CaixaRede[]>([]);
  const [mapa, setMapa] = useState<{ tipo: 'anterior' } | { tipo: 'seguinte'; saida: number } | null>(null);
  // Caixa seguinte de cada saída escolhida nesta edição (saída → id; null desliga). Vai para o servidor ao salvar.
  const [seguintesNovas, setSeguintesNovas] = useState<Record<number, string | null>>({});
  const [capturando, setCapturando] = useState(false);
  const [gruposEditados, setGruposEditados] = useState(!!inicial);
  const [manobra, setManobra] = useState({ entrada: '', saida: 1, fibra: '', motivo: '' });
  const FIBRA_VAZIA = { numero: '', cliente: '', semPotencia: false, potencia: '', reflexao: '', perda: '', posicao: '', tx: '', rx: '', olt: false, oltPosicao: '', sfp: '', sfpModelo: '', cordao: '', oltModelo: '' };
  const [fibra, setFibra] = useState(FIBRA_VAZIA);
  const [camera, setCamera] = useState<Camera | null>(null);
  // Fotos já tiradas: da caixa, da tela do OTDR por fibra e de cada bandeja (enviadas + na fila).
  const [fotos, setFotos] = useState<{ caixa: number; olt: number; otdr: Record<number, number>; bandeja: Record<number, number> }>({ caixa: 0, olt: 0, otdr: {}, bandeja: {} });
  const [salvando, setSalvando] = useState(false);
  const enderecoAuto = useRef('');
  const ponta = ehPonta(c.tipo);
  const dgo = c.tipo === 'dgo';

  const mudar = (campos: Partial<Caixa>) => setC((x) => ({ ...x, ...campos }));

  const servidor = useRef<{ assinatura: string } | null>(null);
  useEffect(() => {
    servidor.current = null;
    const contar = async () => {
      const otdr: Record<number, number> = {};
      const bandeja: Record<number, number> = {};
      let total = 0;
      let olt = 0;
      const somar = (tipo: string, fibraN: number | null | undefined, bandejaN: number | null | undefined) => {
        if (tipo === 'foto_caixa') total++;
        if (tipo === 'foto_olt') olt++;
        if (tipo === 'foto_otdr' && fibraN) otdr[fibraN] = (otdr[fibraN] ?? 0) + 1;
        if (tipo === 'foto_bandeja' && bandejaN) bandeja[bandejaN] = (bandeja[bandejaN] ?? 0) + 1;
      };
      const pendentes = (await itensPendentes()).filter((i) => i.tipo === 'foto' && i.caixaId === c.id);
      // A fila muda a cada lote de GPS: só consulta o servidor de novo quando mudam as fotos desta caixa.
      const assinatura = pendentes.map((i) => i.id).join(',');
      if (servidor.current && assinatura === servidor.current.assinatura) return;
      for (const i of pendentes) if (i.tipo === 'foto') somar(i.tipoAnexo, i.fibra, i.bandeja);
      const { data } = await supabase.from('os_anexos').select('tipo, fibra, bandeja').eq('caixa_id', c.id);
      servidor.current = { assinatura };
      for (const a of data ?? []) somar(a.tipo, a.fibra, a.bandeja);
      setFotos({ caixa: total, olt, otdr, bandeja });
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
    caixasDaRede(setRede).catch(() => undefined);
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
  const todasCaixas = useMemo(() => {
    const ids = new Set(daOs.map((x) => x.id));
    return [...daOs, ...rede.filter((x) => !ids.has(x.id))];
  }, [daOs, rede]);
  // Seguinte de cada saída: a escolhida agora ou a que já vem desta caixa no cadastro.
  const seguinteDa = (saida: number) => {
    const id = saida in seguintesNovas ? seguintesNovas[saida]
      : todasCaixas.find((x) => x.origem_caixa_id === c.id && (x.origem_saida ?? 1) === saida)?.id ?? null;
    return id ? todasCaixas.find((x) => x.id === id) ?? null : null;
  };

  function escolherOrigem(ant: CaixaRede, saida: number) {
    const herdado = herdarDaAnterior(ant, saida);
    setC((x) => ({
      ...x,
      origem_caixa_id: ant.id, origem_saida: saida, origem_dgo: null, origem: ant.identificacao,
      capacidade_fibras: CAPACIDADES.includes(herdado.capacidade) ? herdado.capacidade : x.capacidade_fibras,
      fibras: herdado.fibras, padrao_cores_entrada: herdado.padrao,
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

  // Caixa nova recebe a TAG automática (CE-BKB-0001...), que vira o nome do pin no KMZ.
  // TAG automática na caixa nova, ou quando a caixa muda de tipo (ex.: emenda → DGO) e ainda tem a TAG do tipo antigo.
  const prefixoDaTag = Object.values(PREFIXO_TAG).find((p) => c.identificacao.startsWith(p));
  const tagDeOutroTipo = !!prefixoDaTag && prefixoDaTag !== (PREFIXO_TAG[c.tipo] ?? PREFIXO_TAG.emenda);
  const tagAuto = nova || tagDeOutroTipo ? proximaTag(c.tipo, [...rede, ...daOs].filter((x) => x.id !== c.id)) : null;
  const plano = calcularPlano(c);
  const bandejas = separarBandejas(c);
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
    const potencia = ponta && !dgo ? numero(fibra.potencia) : null;
    const reflexao = ponta ? numero(fibra.reflexao) : null;
    const perda = ponta ? numero(fibra.perda) : null;
    // No DGO a potência é TX/RX e opcional; o sinal só é obrigatório nas outras pontas.
    if (ponta && !fibra.semPotencia && ((!dgo && potencia == null) || reflexao == null || perda == null)) {
      return Alert.alert('Medição do OTDR', dgo
        ? 'No DGO informe reflexão (dB) e perda (dB/km) da fibra, ou marque sem potência. TX/RX são opcionais.'
        : 'Na ponta informe sinal (dBm), reflexão (dB) e perda (dB/km) da fibra, ou marque sem potência.');
    }
    if (dgo && !fibra.posicao.trim()) return Alert.alert('Informe a posição da fibra no DGO', 'Ex.: DIO 2 · posição 14');
    if (dgo && fibra.olt && !fibra.oltPosicao.trim()) return Alert.alert('Informe a posição na OLT', 'Ex.: OLT-01 · slot 2 · PON 5');
    if (!ponta && !fibra.cliente.trim() && !fibra.semPotencia) return Alert.alert('Informe o cliente ou marque sem potência');
    const f: SituacaoFibra = {
      fibra: n, cliente: fibra.cliente.trim() || null, sem_potencia: fibra.semPotencia,
      potencia_dbm: potencia, reflexao_db: reflexao, perda_db_km: perda,
      posicao_dgo: dgo ? fibra.posicao.trim() : null,
      potencia_tx_dbm: dgo ? numero(fibra.tx) : null, potencia_rx_dbm: dgo ? numero(fibra.rx) : null,
      cordao_olt: dgo && fibra.olt, olt_posicao: dgo && fibra.olt ? fibra.oltPosicao.trim() : null,
      sfp_tipo: dgo && fibra.olt ? fibra.sfp.trim() || null : null,
      cordao_tipo: dgo && fibra.olt ? fibra.cordao || null : null, olt_modelo: dgo && fibra.olt ? fibra.oltModelo.trim() || null : null,
      sfp_modelo: dgo && fibra.olt ? fibra.sfpModelo.trim() || null : null,
    };
    mudar({ fibras: [...c.fibras.filter((x) => x.fibra !== n), f].sort((a, b) => a.fibra - b.fibra) });
    // Mantém OLT, modelo, SFP e cordão da fibra anterior: normalmente são iguais no mesmo DGO.
    setFibra({ ...FIBRA_VAZIA, olt: fibra.olt, oltModelo: fibra.oltModelo, sfp: fibra.sfp, sfpModelo: fibra.sfpModelo, cordao: fibra.cordao });
  }

  async function salvar() {
    const identificacao = tagAuto ?? c.identificacao.trim();
    if (!identificacao) return Alert.alert('Informe a identificação', 'Ex.: CE-BKB-0006');
    if (origemTipo === 'dgo' && !c.origem_dgo?.trim()) return Alert.alert('Informe o nome ou TAG de onde vem a fibra');
    if (!c.capacidade_fibras) return Alert.alert('Informe o tamanho do cabo de entrada');
    if (c.saidas.some((q) => !q)) return Alert.alert('Informe o tamanho do cabo de cada saída');
    if (calcularPlano(c).ligacoes.length && !c.fusoes_por_bandeja && !dgo) return Alert.alert('Informe quantas fusões cabem por bandeja');
    if (c.tipo === 'site' && !c.parceiro?.trim()) return Alert.alert('Informe o parceiro do site');
    if ((c.tipo === 'emenda' || c.tipo === 'entroncamento') && !c.instalacao) return Alert.alert('Informe se a caixa é aérea ou subterrânea');
    if (dgo && !c.instalacao) return Alert.alert('Informe onde o DGO está instalado', 'Container, rooftop ou site de outro parceiro.');
    if (dgo && c.instalacao === 'site_parceiro' && !c.parceiro?.trim()) return Alert.alert('Informe de qual parceiro é o site');
    if (c.latitude == null && !(await new Promise<boolean>((ok) => Alert.alert('Sem localização', 'Salvar mesmo assim?', [
      { text: 'Capturar', onPress: () => ok(false) }, { text: 'Salvar', onPress: () => ok(true) }])))) return;
    setSalvando(true);
    const final: Caixa = {
      ...c,
      identificacao,
      grupos_fusionados: grupos.f, grupos_vagos: grupos.v,
      origem_caixa_id: origemTipo === 'caixa' ? c.origem_caixa_id : null,
      origem_saida: origemTipo === 'caixa' ? c.origem_saida : null,
      origem_dgo: origemTipo === 'dgo' ? c.origem_dgo?.trim() || null : null,
      origem_tipo: origemTipo === 'dgo' ? c.origem_tipo || 'dgo' : null,
      origem: origemTipo === 'caixa' ? anterior?.identificacao ?? c.origem : origemTipo === 'dgo' ? origemNaoCadastrada({ origem_dgo: c.origem_dgo?.trim(), origem_tipo: c.origem_tipo }) : null,
      fibras: ponta ? c.fibras : c.fibras.map((f) => ({ ...f, potencia_dbm: null, reflexao_db: null, perda_db_km: null })),
    };
    await salvarCaixa(final, nova);
    for (const [saida, seguinte] of Object.entries(seguintesNovas)) {
      if (Number(saida) > final.saidas.length) continue;
      await enfileirar({ tipo: 'rpc', nome: 'ligar_caixa_seguinte', args: { p_caixa: final.id, p_saida: Number(saida), p_seguinte: seguinte } });
    }
    setSeguintesNovas({});
    setC(final);
    setSalvando(false);
    if (nova) {
      setNova(false);
      Alert.alert('Caixa salva', ponta
        ? 'Agora tire as fotos da caixa, de cada bandeja e a foto da tela do OTDR de cada fibra medida.'
        : 'Agora tire as fotos da caixa e de cada bandeja com as fibras acomodadas.');
    } else voltar();
  }

  const chip = (ativo: boolean) => [s.chip, ativo && s.chipAtivo];
  const textoChip = (ativo: boolean) => [s.chipTexto, ativo && { color: '#fff' }];
  // Padrão de cores de cada cabo (brasileiro, americano ou coroa); pode mudar de uma caixa para outra.
  const padroesSaidas = c.saidas.map((_, i) => c.padrao_cores_saidas?.[i] ?? null);
  // Para onde vai cada saída (tipo + nome), mesmo sem o ponto seguinte cadastrado.
  const destinos: (Destino | null)[] = c.saidas.map((_, i) => c.destinos?.[i] ?? null);
  const mudarDestino = (i: number, d: Destino | null) => mudar({ destinos: destinos.map((x, k) => (k === i ? d : x)) });
  const padroes = (atual: string | null, escolher: (v: string) => void) => (
    <View style={s.chips}>
      {PADROES_CORES.map((p) => (
        <Pressable key={p.valor} style={chip(atual === p.valor)} onPress={() => escolher(p.valor)}>
          <Text style={textoChip(atual === p.valor)}>{p.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Cabecalho titulo={nova ? `Nova caixa · ${tagAuto}` : c.identificacao} subtitulo={rotuloPonto(c.tipo, c.swap)} voltar={voltar} />
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
          {c.tipo === 'emenda' ? (
            <View style={[s.chips, { marginTop: 8 }]}>
              {([[false, 'Emenda normal'], [true, 'Emenda swap']] as const).map(([v, r]) => (
                <Pressable key={r} style={chip(!!c.swap === v)} onPress={() => mudar({ swap: v })}>
                  <Text style={textoChip(!!c.swap === v)}>{r}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={s.rotulo}>{tagAuto ? 'TAG (AUTOMÁTICA)' : 'IDENTIFICAÇÃO *'}</Text>
          {tagAuto ? (
            <>
              <Text style={[s.campo, { fontWeight: '700', color: cores.texto, backgroundColor: cores.fundo }]}>{tagAuto}</Text>
              <Text style={s.suave}>Gerada pelo app; é o nome do pin no KMZ. Se outra caixa ganhar a mesma TAG sem internet, o servidor ajusta para a próxima livre.</Text>
            </>
          ) : (
            <TextInput style={s.campo} value={c.identificacao} onChangeText={(t) => mudar({ identificacao: t })}
              autoCapitalize="characters" placeholder="Ex.: CE-BKB-0006" />
          )}
          {instalacoesDoTipo(c.tipo).length ? (
            <>
              <Text style={s.rotulo}>{dgo ? 'INSTALAÇÃO DO DGO *' : 'INSTALAÇÃO *'}</Text>
              <View style={s.chips}>
                {instalacoesDoTipo(c.tipo).map((t) => (
                  <Pressable key={t.valor} style={chip(c.instalacao === t.valor)} onPress={() => mudar({ instalacao: t.valor })}>
                    <Text style={textoChip(c.instalacao === t.valor)}>{t.rotulo}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {dgo ? (
            <>
              <Text style={s.rotulo}>LOCAL NA SALA (OPCIONAL)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['fila', 'Fila', 'Ex.: 3'], ['rack', 'Rack', 'Ex.: 12'], ['bastidor', 'Bastidor', 'Ex.: B03']] as const).map(([campo, rotulo, ex]) => (
                  <View key={campo} style={{ flex: 1 }}>
                    <Text style={s.suave}>{rotulo}</Text>
                    <TextInput style={s.campo} value={c[campo] ?? ''} onChangeText={(t) => mudar({ [campo]: t })} placeholder={ex} />
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {c.tipo === 'site' || (dgo && c.instalacao === 'site_parceiro') ? (
            <>
              <Text style={s.rotulo}>{dgo ? 'SITE DE QUAL PARCEIRO? *' : 'PARCEIRO *'}</Text>
              <TextInput style={s.campo} value={c.parceiro ?? ''} onChangeText={(t) => mudar({ parceiro: t })}
                placeholder="Ex.: Claro, Vivo, TIM" />
            </>
          ) : null}
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>VEM DE</Text>
          <View style={s.chips}>
            {([['caixa', 'Cadastrado'], ['dgo', 'Não cadastrado'], ['nenhuma', 'Não informar']] as const).map(([v, r]) => (
              <Pressable key={v} style={chip(origemTipo === v)} onPress={() => setOrigemTipo(v)}>
                <Text style={textoChip(origemTipo === v)}>{r}</Text>
              </Pressable>
            ))}
          </View>
          {origemTipo === 'dgo' ? (
            <>
              <View style={[s.chips, { marginTop: 8 }]}>
                {TIPOS_DESTINO.map((t) => (
                  <Pressable key={t.valor} style={chip((c.origem_tipo || 'dgo') === t.valor)} onPress={() => mudar({ origem_tipo: t.valor })}>
                    <Text style={textoChip((c.origem_tipo || 'dgo') === t.valor)}>{t.rotulo}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.campo} value={c.origem_dgo ?? ''} onChangeText={(t) => mudar({ origem_dgo: t })}
                autoCapitalize="characters" placeholder={(c.origem_tipo || 'dgo') === 'dgo' ? 'Nome do DGO / POP' : 'Nome ou TAG, ex.: CE-BKB-0010'} />
            </>
          ) : null}
          {origemTipo === 'caixa' && todasCaixas.some((x) => x.id !== c.id) ? (
            <Pressable style={s.botaoMapa} onPress={() => setMapa({ tipo: 'anterior' })}>
              <Icone nome="map-search-outline" tamanho={18} cor={cores.primaria} />
              <Text style={s.botaoMapaTexto}>{anterior ? `Vem de ${anterior.identificacao} · trocar no mapa` : 'Escolher no mapa (caixa ou DGO)'}</Text>
            </Pressable>
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
              <Pressable key={n} style={chip(c.capacidade_fibras === n)}
                onPress={() => mudar({ capacidade_fibras: n })}>
                <Text style={textoChip(c.capacidade_fibras === n)}>{n}</Text>
              </Pressable>
            ))}
          </View>

          {dgo ? null : (
            <>
              <Text style={s.rotulo}>PADRÃO DE CORES DA ENTRADA</Text>
              {padroes(c.padrao_cores_entrada ?? null, (v) => mudar({ padrao_cores_entrada: v }))}
            </>
          )}

          <Text style={s.rotulo}>{dgo ? 'CABOS QUE SAEM DO DGO' : 'SAÍDAS'}</Text>
          {c.saidas.map((qtd, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontWeight: '600', color: cores.texto }}>{dgo ? 'Cabo' : 'Saída'} {i + 1}</Text>
                <Pressable onPress={() => mudar({ saidas: c.saidas.filter((_, k) => k !== i), manobras: c.manobras.filter((m) => m.saida !== i + 1),
                  padrao_cores_saidas: padroesSaidas.filter((_, k) => k !== i), destinos: destinos.filter((_, k) => k !== i) })}>
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
              {padroes(padroesSaidas[i], (v) => mudar({ padrao_cores_saidas: padroesSaidas.map((x, k) => (k === i ? v : x)) }))}
              {(() => {
                const seg = seguinteDa(i + 1);
                const d = destinos[i];
                return (
                  <View style={s.destino}>
                    <Text style={s.destinoRotulo}>{dgo ? `CABO ${i + 1} VAI PARA` : `SAÍDA ${i + 1} VAI PARA`}</Text>
                    <View style={s.chips}>
                      {TIPOS_DESTINO.map((t) => (
                        <Pressable key={t.valor} style={chip(d?.tipo === t.valor)}
                          onPress={() => mudarDestino(i, d?.tipo === t.valor ? null : { tipo: t.valor, nome: d?.nome ?? null })}>
                          <Text style={textoChip(d?.tipo === t.valor)}>{t.rotulo}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {d && !seg ? (
                      <TextInput style={s.campo} value={d.nome ?? ''} onChangeText={(t) => mudarDestino(i, { ...d, nome: t })}
                        autoCapitalize="characters" placeholder="Nome ou TAG (opcional), ex.: ENT-BKB-0002" />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <Pressable style={[s.botaoMapa, { flex: 1, marginTop: 0 }]} onPress={() => setMapa({ tipo: 'seguinte', saida: i + 1 })}>
                        <Icone nome="map-marker-right-outline" tamanho={18} cor={cores.primaria} />
                        <Text style={s.botaoMapaTexto} numberOfLines={1}>
                          {seg ? `Ligada a ${seg.identificacao} · trocar` : 'Já cadastrado? Escolher no mapa'}
                        </Text>
                      </Pressable>
                      {seg ? (
                        <Pressable hitSlop={8} onPress={() => setSeguintesNovas((x) => ({ ...x, [i + 1]: null }))}>
                          <Icone nome="link-variant-off" tamanho={20} cor={cores.suave} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })()}
            </View>
          ))}
          <Pressable style={[s.botaoPequeno, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => mudar({ saidas: [...c.saidas, 0], padrao_cores_saidas: [...padroesSaidas, null], destinos: [...destinos, null] })}>
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
          <Text style={s.rotulo}>BANDEJAS · FUSÕES POR BANDEJA</Text>
          <View style={s.chips}>
            {FUSOES_POR_BANDEJA.map((n) => (
              <Pressable key={n} style={chip(c.fusoes_por_bandeja === n)} onPress={() => mudar({ fusoes_por_bandeja: n })}>
                <Text style={textoChip(c.fusoes_por_bandeja === n)}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {bandejas.length === 0 ? <Text style={s.suave}>Cadastre as saídas para separar as fusões nas bandejas.</Text> : null}
          {bandejas.map((b) => {
            const feitas = fotos.bandeja[b.numero] ?? 0;
            return (
              <View key={b.numero} style={s.linha}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.texto, { fontWeight: '700' }]}>Bandeja {b.numero} · {b.ligacoes.length} fusões</Text>
                  <Text style={s.suave}>{faixasDaBandeja(b)}{b.ligacoes.some((l) => l.manobra) ? ' · com manobra' : ''}</Text>
                </View>
                <Pressable disabled={nova} onPress={() => setCamera({ tipo: 'foto_bandeja', bandeja: b.numero, titulo: `${c.identificacao} · Bandeja ${b.numero}`, feitas })}>
                  <Text style={{ color: feitas ? cores.sucesso : nova ? cores.suave : cores.perigo, fontWeight: '700' }}>
                    {feitas ? `✓ Foto (${feitas})` : nova ? 'Salve p/ fotografar' : '📷 Falta foto'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={s.bloco}>
          <Text style={s.rotulo}>MANOBRAS ({c.manobras.length})</Text>
          {c.manobras.map((m) => (
            <View key={m.fibra_entrada} style={s.linha}>
              <View style={{ flex: 1 }}>
                <Text style={s.texto}>{descreverFibra(m.fibra_entrada, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)}</Text>
                <Text style={s.suave}>→ Saída {m.saida}: {descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras, c.padrao_cores_saidas?.[m.saida - 1] ?? undefined)}{m.motivo ? ` · ${m.motivo}` : ''}</Text>
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
          <Text style={s.rotulo}>{dgo ? 'FIBRAS: CLIENTE, POSIÇÃO NO DGO E OTDR' : ponta ? 'FIBRAS: CLIENTE, SINAL E SEM POTÊNCIA' : 'FIBRAS: CLIENTE E SEM POTÊNCIA'} ({c.fibras.length})</Text>
          {c.fibras.map((f) => (
            <View key={f.fibra} style={s.linha}>
              <View style={{ flex: 1 }}>
                <Text style={s.texto}>{descreverFibra(f.fibra, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)}</Text>
                <Text style={[s.suave, f.sem_potencia && { color: cores.perigo, fontWeight: '700' }]}>
                  {[f.cliente, f.sem_potencia ? 'SEM POTÊNCIA' : null].filter(Boolean).join(' · ')}
                </Text>
                {dgo ? (
                  <Text style={s.suave}>
                    Posição {f.posicao_dgo || '—'}{f.cordao_olt ? ` · ${descreverOlt(f)}` : ''}{f.potencia_tx_dbm != null ? ` · ${f.cordao_olt ? 'Saída OLT' : 'TX'} ${f.potencia_tx_dbm} dBm` : ''}{f.potencia_rx_dbm != null ? ` · RX ${f.potencia_rx_dbm} dBm` : ''}
                  </Text>
                ) : null}
                {ponta && !f.sem_potencia ? (
                  <Text style={s.suave}>
                    {dgo ? '' : `Sinal ${f.potencia_dbm ?? '—'} dBm · `}Reflexão {f.reflexao_db ?? '—'} dB · Perda {f.perda_db_km ?? '—'} dB/km
                  </Text>
                ) : null}
                {ponta && !f.sem_potencia ? (
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
          {dgo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1 }} />
              <Text style={s.texto}>Cordão até OLT</Text>
              <Switch value={fibra.olt} onValueChange={(v) => setFibra({ ...fibra, olt: v })} />
            </View>
          ) : null}
          {dgo && fibra.olt ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[s.campo, { flex: 1 }]} placeholder="Posição na OLT * (slot · PON)" value={fibra.oltPosicao}
                onChangeText={(t) => setFibra({ ...fibra, oltPosicao: t })} />
            </View>
          ) : null}
          {dgo && fibra.olt ? (
            <>
              <Text style={s.rotulo}>MODELO DA OLT</Text>
              <View style={s.chips}>
                {MODELOS_OLT.map((m) => (
                  <Pressable key={m} style={chip(fibra.oltModelo === m)} onPress={() => setFibra({ ...fibra, oltModelo: m })}>
                    <Text style={textoChip(fibra.oltModelo === m)}>{m}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.campo} placeholder="Ou digite o modelo da OLT" value={fibra.oltModelo}
                onChangeText={(t) => setFibra({ ...fibra, oltModelo: t })} />
              <Text style={s.rotulo}>SFP</Text>
              <View style={s.chips}>
                {TIPOS_SFP.map((t) => (
                  <Pressable key={t} style={chip(fibra.sfp === t)} onPress={() => setFibra({ ...fibra, sfp: t })}>
                    <Text style={textoChip(fibra.sfp === t)}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.campo, { flex: 1 }]} placeholder="Tipo (outro)" autoCapitalize="characters" value={fibra.sfp}
                  onChangeText={(t) => setFibra({ ...fibra, sfp: t })} />
                <TextInput style={[s.campo, { flex: 1.6 }]} placeholder="Modelo / part number do SFP" value={fibra.sfpModelo}
                  onChangeText={(t) => setFibra({ ...fibra, sfpModelo: t })} />
              </View>
              <Text style={s.rotulo}>CORDÃO OLT ↔ DGO</Text>
              <View style={s.chips}>
                {TIPOS_CORDAO.map((t) => (
                  <Pressable key={t} style={chip(fibra.cordao === t)} onPress={() => setFibra({ ...fibra, cordao: t })}>
                    <Text style={textoChip(fibra.cordao === t)}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {dgo ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[s.campo, { flex: 1.4 }]} placeholder="Posição no DGO *" value={fibra.posicao}
                onChangeText={(t) => setFibra({ ...fibra, posicao: t })} />
              <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder={fibra.olt ? 'Saída OLT dBm' : 'TX dBm'}
                value={fibra.tx} onChangeText={(t) => setFibra({ ...fibra, tx: t })} />
              <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder="RX dBm"
                value={fibra.rx} onChangeText={(t) => setFibra({ ...fibra, rx: t })} />
            </View>
          ) : null}
          {ponta ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {dgo ? null : (
                <TextInput style={[s.campo, { flex: 1 }]} keyboardType="numbers-and-punctuation" placeholder="Sinal dBm"
                  value={fibra.potencia} onChangeText={(t) => setFibra({ ...fibra, potencia: t })} />
              )}
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
              <Text style={s.botaoTexto}>{dgo ? 'Fotos do DGO' : 'Fotos da acomodação da caixa'} ({fotos.caixa})</Text>
            </Pressable>
          ) : null}
          {!nova && dgo && c.fibras.some((f) => f.cordao_olt) ? (
            <Pressable style={[s.botao, { backgroundColor: cores.primaria }]}
              onPress={() => setCamera({ tipo: 'foto_olt', titulo: `${c.identificacao} · OLT`, feitas: fotos.olt })}>
              <Text style={s.botaoTexto}>Fotos da OLT e cordões ({fotos.olt})</Text>
            </Pressable>
          ) : null}
          {!nova ? null : (
            <Text style={s.suave}>Depois de salvar, tire as fotos da acomodação da caixa{ponta ? ' e do OTDR' : ''}.</Text>
          )}
        </View>
      </ScrollView>
      <Modal visible={!!camera} onRequestClose={() => setCamera(null)} animationType="fade" supportedOrientations={['landscape', 'portrait']}>
        {camera ? (
          <CameraOS osId={osId} fotosJaFeitas={camera.feitas} minimo={camera.tipo === 'foto_caixa' ? 2 : 1} usuario={usuario}
            caixa={{ id: c.id, tipo: camera.tipo, fibra: camera.fibra, bandeja: camera.bandeja, titulo: camera.titulo }} fechar={() => setCamera(null)} />
        ) : null}
      </Modal>
      <MapaCaixas aberto={!!mapa} modo={mapa ?? { tipo: 'anterior' }}
        caixas={todasCaixas.filter((x) => x.id !== c.id)}
        aqui={c.latitude != null && c.longitude != null ? { lat: c.latitude, lng: c.longitude } : null}
        atual={mapa?.tipo === 'seguinte' ? seguinteDa(mapa.saida)?.id ?? null : c.origem_caixa_id}
        escolher={(x) => {
          if (mapa?.tipo === 'seguinte') {
            setSeguintesNovas((v) => ({ ...v, [mapa.saida]: x.id }));
            mudarDestino(mapa.saida - 1, { tipo: x.tipo === 'emenda' && x.swap ? 'swap' : x.tipo ?? 'emenda', nome: x.identificacao });
          }
          else escolherOrigem(x, x.saidas.length === 1 ? 1 : c.origem_caixa_id === x.id ? c.origem_saida ?? 1 : 1);
        }}
        fechar={() => setMapa(null)} />
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
  destino: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: cores.fundo },
  destinoRotulo: { fontSize: 11.5, fontWeight: '700', color: cores.apagado, letterSpacing: 0.4 },
  botaoMapa: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: cores.primaria, backgroundColor: cores.selecionado },
  botaoMapaTexto: { color: cores.primaria, fontWeight: '700', fontSize: 13.5, flexShrink: 1 },
  botaoPequeno: { backgroundColor: cores.primaria, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  botaoPequenoTexto: { color: '#fff', fontWeight: '700' },
  botao: { borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rodape: { backgroundColor: cores.cartao, borderTopWidth: 1, borderTopColor: cores.borda, padding: 12 },
});
