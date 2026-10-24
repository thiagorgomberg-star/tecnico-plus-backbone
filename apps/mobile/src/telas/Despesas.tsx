import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Cabecalho from '../componentes/Cabecalho';
import Icone from '../componentes/Icone';
import { cores, estilo, fundoDe } from '../lib/estilo';
import { aoMudarFila, enfileirar, ItemFila, itensPendentes } from '../lib/fila';
import { posicaoAtual } from '../lib/localizacao';
import { ponto, supabase } from '../lib/supabase';

export const CATEGORIAS: Record<string, string> = {
  combustivel: 'Combustível',
  pedagio: 'Pedágio',
  estacionamento: 'Estacionamento',
  alimentacao: 'Alimentação',
  hospedagem: 'Hospedagem',
  ferramenta: 'Ferramenta',
  material: 'Material',
  manutencao_veiculo: 'Manutenção do veículo',
  outros: 'Outros',
};
const PAGAMENTOS: Record<string, string> = { cartao_empresa: 'Cartão da empresa', adiantamento: 'Adiantamento' };
const COMBUSTIVEIS: Record<string, string> = { gasolina: 'Gasolina', etanol: 'Etanol', diesel: 'Diesel', gnv: 'GNV' };
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  enviando: { rotulo: 'Aguardando internet', cor: cores.suave },
  pendente: { rotulo: 'Em conferência', cor: cores.alerta },
  aprovada: { rotulo: 'Aprovada', cor: cores.sucesso },
  recusada: { rotulo: 'Recusada', cor: cores.perigo },
};
const CACHE = 'despesas-cache';
const CHAVE_PLACA = 'despesas-ultima-placa';

type Despesa = {
  id: string; data: string; categoria: string; valor: number; pagamento: string; fornecedor: string | null; descricao: string | null;
  os_id: string | null; placa: string | null; litros: number | null; odometro_km: number | null; combustivel: string | null;
  status: string; motivo_recusa: string | null; reembolso: string | null;
};
type OSResumo = { id: string; numero: number; titulo: string; status: string };

const reais = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (texto: string) => {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  // "1.234,56" ou "1234,56" ou "1234.56"
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return Number.isFinite(n) && limpo !== '' ? n : null;
};
const hojeBr = () => new Date().toLocaleDateString('pt-BR');
const isoDeBr = (br: string) => {
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? null : iso;
};
const brDeIso = (iso: string) => iso.split('-').reverse().join('/');

// Despesas de campo com foto do comprovante. Funciona sem internet: entra na fila e sobe depois.
export default function Despesas({ voltar }: { voltar: () => void }) {
  const [lista, setLista] = useState<Despesa[]>([]);
  const [naFila, setNaFila] = useState<Despesa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState<Despesa | 'nova' | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const desde = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase.from('despesas')
      .select('id, data, categoria, valor, pagamento, fornecedor, descricao, os_id, placa, litros, odometro_km, combustivel, status, motivo_recusa, reembolso')
      .gte('data', desde).order('data', { ascending: false }).order('criado_em', { ascending: false });
    if (data) {
      setLista(data);
      AsyncStorage.setItem(CACHE, JSON.stringify(data));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((c) => c && setLista(JSON.parse(c)));
    carregar();
    const lerFila = () => itensPendentes().then((itens) => setNaFila(
      itens.filter((i): i is Extract<ItemFila, { tipo: 'despesa' }> => i.tipo === 'despesa')
        .map((i) => ({ ...(i.linha as unknown as Despesa), status: 'enviando' })),
    ));
    lerFila();
    // Quando a fila esvazia, busca de novo para mostrar o que acabou de subir.
    return aoMudarFila(() => { lerFila(); carregar(); });
  }, [carregar]);

  if (editando) {
    return <FormDespesa despesa={editando === 'nova' ? null : editando} fechar={() => { setEditando(null); carregar(); }} />;
  }

  const ids = new Set(naFila.map((d) => d.id));
  const todas = [...naFila, ...lista.filter((d) => !ids.has(d.id))];
  const mes = new Date().toISOString().slice(0, 7);
  const totalMes = todas.filter((d) => d.data.startsWith(mes) && d.status !== 'recusada').reduce((t, d) => t + Number(d.valor), 0);

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo="Despesas" subtitulo={`Este mês: ${reais(totalMes)}`} voltar={voltar} />
      <ScrollView refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        <Pressable style={[estilo.botao, { marginHorizontal: 16, marginTop: 12 }]} onPress={() => setEditando('nova')}>
          <Text style={estilo.botaoTexto}>+ Lançar despesa</Text>
        </Pressable>
        {todas.length === 0 && <Text style={[estilo.suave, { margin: 16 }]}>Nenhuma despesa nos últimos 60 dias.</Text>}
        {todas.map((d) => {
          const st = STATUS[d.status] ?? STATUS.pendente;
          const podeCorrigir = d.status === 'recusada' || d.status === 'pendente';
          return (
            <Pressable key={d.id} style={s.linha} disabled={!podeCorrigir} onPress={() => setEditando(d)}>
              <View style={{ flex: 1 }}>
                <Text style={s.titulo}>{CATEGORIAS[d.categoria] ?? d.categoria}{d.fornecedor ? ` · ${d.fornecedor}` : ''}</Text>
                <Text style={estilo.suave}>
                  {brDeIso(d.data)}{d.categoria === 'combustivel' && d.litros ? ` · ${d.litros} L · ${d.odometro_km} km` : ''}
                </Text>
                {d.status === 'recusada' && d.motivo_recusa ? (
                  <Text style={{ color: cores.perigo, marginTop: 2 }}>Motivo: {d.motivo_recusa} (toque para corrigir)</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.valor}>{reais(d.valor)}</Text>
                <Text style={{ color: st.cor, fontSize: 12, fontWeight: '700' }}>{st.rotulo}</Text>
                {d.reembolso ? (
                  <Text style={{ color: d.reembolso === 'pago' ? cores.sucesso : cores.primaria, fontSize: 12, fontWeight: '700' }}>
                    {d.reembolso === 'pago' ? 'Reembolso pago' : 'Reembolso solicitado'}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function FormDespesa({ despesa, fechar }: { despesa: Despesa | null; fechar: () => void }) {
  const [categoria, setCategoria] = useState(despesa?.categoria ?? 'combustivel');
  const [data, setData] = useState(despesa ? brDeIso(despesa.data) : hojeBr());
  const [valor, setValor] = useState(despesa ? String(despesa.valor).replace('.', ',') : '');
  const [reembolso, setReembolso] = useState(despesa ? despesa.pagamento === 'reembolso' : false);
  const [pagamento, setPagamento] = useState(despesa && despesa.pagamento !== 'reembolso' ? despesa.pagamento : 'cartao_empresa');
  const [fornecedor, setFornecedor] = useState(despesa?.fornecedor ?? '');
  const [descricao, setDescricao] = useState(despesa?.descricao ?? '');
  const [placa, setPlaca] = useState(despesa?.placa ?? '');
  const [combustivel, setCombustivel] = useState(despesa?.combustivel ?? 'gasolina');
  const [litros, setLitros] = useState(despesa?.litros ? String(despesa.litros).replace('.', ',') : '');
  const [odometro, setOdometro] = useState(despesa?.odometro_km ? String(despesa.odometro_km) : '');
  const [osId, setOsId] = useState<string | null>(despesa?.os_id ?? null);
  const [ordens, setOrdens] = useState<OSResumo[]>([]);
  const [foto, setFoto] = useState<{ uri: string; extensao: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const combustivelSel = categoria === 'combustivel';

  useEffect(() => {
    if (!despesa) AsyncStorage.getItem(CHAVE_PLACA).then((p) => p && setPlaca(p));
    AsyncStorage.getItem('ordens-cache').then((c) => {
      if (!c) return;
      const todas: OSResumo[] = JSON.parse(c);
      setOrdens(todas.filter((o) => ['aceita', 'em_execucao', 'pausada', 'concluida'].includes(o.status)).slice(0, 8));
    });
  }, [despesa]);

  async function escolher(origem: 'camera' | 'galeria') {
    const permissao = origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return Alert.alert('Permissão negada', 'Permita o acesso para anexar o comprovante.');
    const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (r.canceled || !r.assets[0]) return;
    const uri = r.assets[0].uri;
    setFoto({ uri, extensao: /\.png$/i.test(uri) ? 'png' : 'jpg' });
  }

  async function salvar() {
    const v = numero(valor);
    const iso = isoDeBr(data);
    if (!iso) return Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA.');
    if (!v || v <= 0) return Alert.alert('Informe o valor', 'Valor total do comprovante, ex.: 250,90.');
    if (!foto && !despesa) return Alert.alert('Falta o comprovante', 'Fotografe a nota ou o recibo.');
    const l = numero(litros);
    const km = numero(odometro);
    if (combustivelSel) {
      if (!placa.trim()) return Alert.alert('Informe a placa', 'Placa do veículo abastecido.');
      if (!l || l <= 0) return Alert.alert('Informe os litros', 'Quantidade abastecida, ex.: 42,5.');
      if (km == null || km <= 0) return Alert.alert('Informe o odômetro', 'Km do painel no momento do abastecimento.');
      if (v / l < 2 || v / l > 15) {
        const seguir = await new Promise<boolean>((ok) => Alert.alert('Confira os valores',
          `Isso dá ${reais(v / l)} por litro. Está certo?`, [{ text: 'Corrigir', onPress: () => ok(false) }, { text: 'Está certo', onPress: () => ok(true) }]));
        if (!seguir) return;
      }
    }
    if (categoria === 'outros' && !descricao.trim()) return Alert.alert('Descreva a despesa', 'Em "Outros", diga o que foi.');

    setSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao.session?.user.id;
    if (!usuario) {
      setSalvando(false);
      return Alert.alert('Sessão expirada', 'Entre de novo no app.');
    }
    // A foto da galeria/câmera fica no cache; copia para a pasta do app até subir.
    let arquivo: string | null = null;
    if (foto) {
      const pasta = new Directory(Paths.document, 'despesas');
      if (!pasta.exists) pasta.create();
      const destino = new File(pasta, `${randomUUID()}.${foto.extensao}`);
      new File(foto.uri).copy(destino);
      arquivo = destino.uri;
    }
    const pos = despesa ? null : await Promise.race([
      posicaoAtual().catch(() => null),
      new Promise<null>((ok) => setTimeout(() => ok(null), 4000)),
    ]);
    const linha = {
      id: despesa?.id ?? randomUUID(),
      tecnico_id: usuario,
      data: iso,
      categoria,
      valor: Math.round(v * 100) / 100,
      pagamento: reembolso ? 'reembolso' : pagamento,
      reembolso: reembolso ? (despesa?.reembolso ?? 'solicitado') : null,
      fornecedor: fornecedor.trim() || null,
      descricao: descricao.trim() || null,
      os_id: osId,
      placa: combustivelSel || categoria === 'manutencao_veiculo' ? placa.trim().toUpperCase() || null : null,
      litros: combustivelSel ? l : null,
      odometro_km: combustivelSel ? Math.round(km!) : null,
      combustivel: combustivelSel ? combustivel : null,
      status: 'pendente',
      ...(pos ? { posicao: ponto(pos.latitude, pos.longitude) } : {}),
    };
    if (combustivelSel) AsyncStorage.setItem(CHAVE_PLACA, linha.placa ?? '');
    await enfileirar({ tipo: 'despesa', linha, arquivo, extensao: foto?.extensao ?? 'jpg', correcao: !!despesa });
    setSalvando(false);
    fechar();
  }

  const chip = (ativo: boolean) => [s.chip, ativo && { backgroundColor: cores.primaria, borderColor: cores.primaria }];
  const chips = (opcoes: Record<string, string>, atual: string, mudar: (v: string) => void) => (
    <View style={s.chips}>
      {Object.entries(opcoes).map(([k, rotulo]) => (
        <Pressable key={k} style={chip(atual === k)} onPress={() => mudar(k)}>
          <Text style={[s.chipTexto, atual === k && { color: '#fff' }]}>{rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={estilo.tela}>
      <Cabecalho titulo={despesa ? 'Corrigir despesa' : 'Lançar despesa'} voltar={fechar} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {despesa?.motivo_recusa ? (
          <Text style={{ color: cores.perigo, marginHorizontal: 16, marginTop: 12 }}>Recusada: {despesa.motivo_recusa}</Text>
        ) : null}
        <View style={estilo.cartao}>
          <Text style={s.rotulo}>Comprovante {despesa ? '(nova foto opcional)' : '*'}</Text>
          {foto ? <Image source={{ uri: foto.uri }} style={s.foto} resizeMode="contain" /> : null}
          <View style={s.chips}>
            <Pressable style={[s.botaoFoto, { backgroundColor: cores.primaria }]} onPress={() => escolher('camera')}>
              <Text style={s.botaoFotoTexto}>{foto ? 'Fotografar de novo' : 'Fotografar nota'}</Text>
            </Pressable>
            <Pressable style={[s.botaoFoto, { backgroundColor: cores.barra }]} onPress={() => escolher('galeria')}>
              <Text style={s.botaoFotoTexto}>Da galeria</Text>
            </Pressable>
          </View>

          <Text style={s.rotulo}>Tipo *</Text>
          {chips(CATEGORIAS, categoria, setCategoria)}

          <View style={s.dupla}>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>Valor total (R$) *</Text>
              <TextInput style={estilo.campo} value={valor} onChangeText={setValor} keyboardType="decimal-pad" placeholder="0,00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>Data *</Text>
              <TextInput style={estilo.campo} value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" placeholder="DD/MM/AAAA" />
            </View>
          </View>

          {combustivelSel && (
            <>
              <Text style={s.rotulo}>Combustível</Text>
              {chips(COMBUSTIVEIS, combustivel, setCombustivel)}
              <View style={s.dupla}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rotulo}>Litros *</Text>
                  <TextInput style={estilo.campo} value={litros} onChangeText={setLitros} keyboardType="decimal-pad" placeholder="0,00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rotulo}>Odômetro (km) *</Text>
                  <TextInput style={estilo.campo} value={odometro} onChangeText={setOdometro} keyboardType="number-pad" />
                </View>
              </View>
            </>
          )}
          {(combustivelSel || categoria === 'manutencao_veiculo') && (
            <>
              <Text style={s.rotulo}>Placa {combustivelSel ? '*' : ''}</Text>
              <TextInput style={estilo.campo} value={placa} onChangeText={setPlaca} autoCapitalize="characters" placeholder="ABC1D23" />
            </>
          )}

          <Text style={s.rotulo}>{combustivelSel ? 'Posto' : 'Estabelecimento / fornecedor'}</Text>
          <TextInput style={estilo.campo} value={fornecedor} onChangeText={setFornecedor} />

          <Pressable style={[s.reembolso, reembolso && { borderColor: cores.primaria, backgroundColor: fundoDe(cores.primaria) }]}
            onPress={() => setReembolso(!reembolso)} disabled={despesa?.reembolso === 'pago'}>
            <Icone nome={reembolso ? 'checkbox-marked' : 'checkbox-blank-outline'} tamanho={26} cor={reembolso ? cores.primaria : cores.suave} />
            <View style={{ flex: 1 }}>
              <Text style={s.reembolsoTitulo}>SOLICITAR REEMBOLSO</Text>
              <Text style={estilo.suave}>Paguei com meu dinheiro e quero receber de volta.</Text>
            </View>
          </Pressable>
          {!reembolso && (
            <>
              <Text style={s.rotulo}>Forma de pagamento</Text>
              {chips(PAGAMENTOS, pagamento, setPagamento)}
            </>
          )}

          {ordens.length > 0 && (
            <>
              <Text style={s.rotulo}>O.S. relacionada (opcional)</Text>
              <View style={s.chips}>
                {ordens.map((o) => (
                  <Pressable key={o.id} style={chip(osId === o.id)} onPress={() => setOsId(osId === o.id ? null : o.id)}>
                    <Text style={[s.chipTexto, osId === o.id && { color: '#fff' }]} numberOfLines={1}>
                      {o.numero ? `#${o.numero} ` : ''}{o.titulo}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={s.rotulo}>Observação {categoria === 'outros' ? '*' : ''}</Text>
          <TextInput style={[estilo.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={descricao} onChangeText={setDescricao} multiline
            placeholder={categoria === 'ferramenta' || categoria === 'material' ? 'O que foi comprado e por quê' : ''} />

          <Pressable style={[estilo.botao, { backgroundColor: cores.sucesso }]} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={estilo.botaoTexto}>{despesa ? 'Reenviar para conferência' : 'Salvar despesa'}</Text>}
          </Pressable>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: cores.borda },
  titulo: { fontSize: 15, fontWeight: '600', color: cores.texto },
  valor: { fontSize: 16, fontWeight: '700', color: cores.texto },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.suave, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: cores.borda, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
  chipTexto: { color: cores.texto, fontSize: 14 },
  dupla: { flexDirection: 'row', gap: 12 },
  foto: { width: '100%', height: 220, marginTop: 8, borderRadius: 8, backgroundColor: cores.fundo },
  botaoFoto: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  botaoFotoTexto: { color: '#fff', fontWeight: '700' },
  reembolso: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 12, borderWidth: 1.5, borderColor: cores.borda, borderRadius: 10 },
  reembolsoTitulo: { fontSize: 15, fontWeight: '800', color: cores.texto, letterSpacing: 0.3 },
});
