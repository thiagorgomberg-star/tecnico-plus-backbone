import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Cabecalho, { FundoDegrade } from '../componentes/Cabecalho';
import Icone, { NomeIcone } from '../componentes/Icone';
import { abrirPdf, Curso, meusCursos, situacaoCurso } from '../lib/cursos';
import { cores, sombra } from '../lib/estilo';
import { supabase } from '../lib/supabase';
import { descreverVeiculo, MeuVeiculo, meuVeiculo } from '../lib/veiculo';

// Ficha do próprio técnico (o supervisor preenche no painel, em Equipe). Mostra tudo, mesmo em branco.
type Ficha = {
  id: string; nome: string; cargo: string | null; matricula: string | null; papel: string; ativo: boolean; telefone: string | null;
  cpf: string | null; rg: string | null; documento: string | null; data_nascimento: string | null; data_admissao: string | null;
  email_contato: string | null; endereco: string | null; cnh_numero: string | null; cnh_categoria: string | null; cnh_validade: string | null;
  contato_emergencia: string | null; telefone_emergencia: string | null;
  tamanho_camisa: string | null; tamanho_calca: string | null; tamanho_calcado: string | null;
  inicio_jornada: string | null; fim_jornada: string | null; fim_jornada_sexta: string | null; regime_horas: string | null;
  tipo_sanguineo: string | null; alergias: string | null; escolaridade: string | null; formacao: string | null; pis: string | null; observacao: string | null;
};
const CAMPOS = 'id, nome, cargo, matricula, papel, ativo, telefone, cpf, rg, documento, data_nascimento, data_admissao, email_contato, endereco, '
  + 'cnh_numero, cnh_categoria, cnh_validade, contato_emergencia, telefone_emergencia, tamanho_camisa, tamanho_calca, tamanho_calcado, '
  + 'inicio_jornada, fim_jornada, fim_jornada_sexta, regime_horas, tipo_sanguineo, alergias, escolaridade, formacao, pis, observacao';
const CACHE = 'meu-perfil';

const dataBr = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : null);
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'T';
const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

export default function MeuPerfil({ voltar }: { voltar: () => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState<MeuVeiculo | null>(null);
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((c) => c && setFicha((f) => f ?? JSON.parse(c)));
    AsyncStorage.getItem('config-empresa').then((c) => c && setEmpresa(JSON.parse(c)?.razao_social ?? null)).catch(() => {});
    AsyncStorage.getItem('meus-auxiliares').then((c) => c && setAuxiliares(JSON.parse(c).map((a: { nome: string }) => a.nome))).catch(() => {});
    meuVeiculo(false).then(setVeiculo).catch(() => {});
    meusCursos(setCursos).catch(() => {});
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const id = sessao.session?.user.id;
      if (!id) return;
      const { data } = await supabase.from('usuarios').select(CAMPOS).eq('id', id).maybeSingle();
      if (data) {
        setFicha(data as unknown as Ficha);
        AsyncStorage.setItem(CACHE, JSON.stringify(data));
      }
      const emp = await supabase.from('config_empresa').select('razao_social').maybeSingle();
      if (emp.data?.razao_social) setEmpresa(emp.data.razao_social);
    })();
  }, []);

  const cnhVencida = !!ficha?.cnh_validade && new Date(`${ficha.cnh_validade}T23:59:59`) < new Date();
  const papel = ficha?.papel === 'auxiliar' ? 'Auxiliar técnico' : 'Técnico de campo';

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <Cabecalho titulo="Meu perfil" subtitulo="Crachá virtual" voltar={voltar} estendido={60} />

        {/* Crachá */}
        <View style={s.cracha}>
          <View style={s.crachaTopo}>
            <FundoDegrade />
            <Text style={s.empresa} numberOfLines={1}>{(empresa ?? 'Multivale Engenharia').toUpperCase()}</Text>
            <Text style={s.setor}>Backbone · Fibra óptica</Text>
          </View>
          <View style={s.avatarBorda}>
            <View style={s.avatar}><Text style={s.avatarTexto}>{iniciais(ficha?.nome ?? '')}</Text></View>
          </View>
          <Text style={s.nome}>{ficha?.nome ?? '—'}</Text>
          <Text style={s.cargo}>{ficha?.cargo || papel}</Text>
          <View style={s.chips}>
            <View style={[s.chip, { backgroundColor: ficha?.ativo === false ? '#FDECEC' : '#E7F6EC' }]}>
              <View style={[s.ponto, { backgroundColor: ficha?.ativo === false ? cores.perigo : '#22A04B' }]} />
              <Text style={[s.chipTexto, { color: ficha?.ativo === false ? cores.perigo : '#1E7B3A' }]}>{ficha?.ativo === false ? 'Inativo' : 'Ativo'}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: cores.selecionado }]}>
              <Text style={[s.chipTexto, { color: cores.primaria }]}>Matrícula {ficha?.matricula || '—'}</Text>
            </View>
          </View>
          <View style={s.crachaGrade}>
            <Dado rotulo="CPF" valor={ficha?.cpf ?? ficha?.documento} />
            <Dado rotulo="RG" valor={ficha?.rg} />
            <Dado rotulo="Admissão" valor={dataBr(ficha?.data_admissao ?? null)} />
            <Dado rotulo="Telefone" valor={ficha?.telefone} />
          </View>
          <View style={s.crachaRodape}>
            <Icone nome="shield-check-outline" tamanho={14} cor={cores.apagado} />
            <Text style={s.rodapeTexto}>ID {ficha?.id.slice(0, 8).toUpperCase() ?? '—'} · válido enquanto ativo</Text>
          </View>
        </View>

        {(['licenca', 'nr', 'profissionalizante'] as const).map((tipo) => {
          const lista = cursos.filter((c) => c.tipo === tipo);
          const titulo = tipo === 'licenca' ? 'LICENÇAS' : tipo === 'nr' ? 'NORMAS REGULAMENTADORAS (NR)' : 'CURSOS PROFISSIONALIZANTES';
          const icone: NomeIcone = tipo === 'licenca' ? 'file-certificate-outline' : tipo === 'nr' ? 'shield-account-outline' : 'school-outline';
          if (!lista.length && tipo === 'licenca') return null;
          return (
            <Grupo key={tipo} titulo={titulo} icone={icone}>
              {lista.length ? lista.map((c) => {
                const sit = situacaoCurso(c);
                const cor = sit === 'vencido' ? cores.perigo : sit === 'vence' ? cores.alerta : sit === 'ok' ? cores.sucesso : cores.suave;
                return (
                  <View key={c.id} style={s.curso}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cursoNome}>{c.curso}</Text>
                      <Text style={s.cursoSub}>
                        {[c.instituicao, c.carga_horaria ? `${c.carga_horaria} h` : null, c.data_conclusao ? `concluído ${dataBr(c.data_conclusao)}` : null].filter(Boolean).join(' · ') || '—'}
                      </Text>
                      <Text style={[s.cursoValidade, { color: cor }]}>
                        {sit === 'sem' ? 'Sem vencimento' : `${sit === 'vencido' ? 'Vencido em' : 'Válido até'} ${dataBr(c.validade)}`}
                      </Text>
                    </View>
                    {c.arquivo ? (
                      <Pressable style={s.pdf} disabled={abrindo === c.id} onPress={async () => {
                        setAbrindo(c.id);
                        try { await abrirPdf(c); } catch { Alert.alert('PDF indisponível', 'Conecte à internet uma vez para guardar o arquivo no celular.'); }
                        setAbrindo(null);
                      }}>
                        {abrindo === c.id ? <ActivityIndicator color={cores.primaria} /> : <Icone nome="file-pdf-box" tamanho={22} cor={cores.primaria} />}
                        <Text style={s.pdfTexto}>Abrir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              }) : <Text style={s.semCurso}>Nenhum cadastrado.</Text>}
            </Grupo>
          );
        })}

        <Grupo titulo="DOCUMENTOS" icone="card-account-details-outline">
          <Linha rotulo="Data de nascimento" valor={dataBr(ficha?.data_nascimento ?? null)} />
          <Linha rotulo="CNH" valor={[ficha?.cnh_numero, ficha?.cnh_categoria && `cat. ${ficha.cnh_categoria}`].filter(Boolean).join(' · ') || null} />
          <Linha rotulo="Validade da CNH" valor={dataBr(ficha?.cnh_validade ?? null)} alerta={cnhVencida ? 'Vencida' : undefined} />
          <Linha rotulo="PIS / NIT" valor={ficha?.pis} />
        </Grupo>

        <Grupo titulo="INFORMAÇÕES COMPLEMENTARES" icone="information-outline">
          <Linha rotulo="Tipo sanguíneo" valor={ficha?.tipo_sanguineo} />
          <Linha rotulo="Alergias / restrições" valor={ficha?.alergias} />
          <Linha rotulo="Escolaridade" valor={ficha?.escolaridade} />
          <Linha rotulo="Formação" valor={ficha?.formacao} />
          <Linha rotulo="Observações" valor={ficha?.observacao} />
        </Grupo>

        <Grupo titulo="CONTATO" icone="phone-outline">
          <Linha rotulo="E-mail" valor={ficha?.email_contato} />
          <Linha rotulo="Endereço" valor={ficha?.endereco} />
          <Linha rotulo="Emergência" valor={[ficha?.contato_emergencia, ficha?.telefone_emergencia].filter(Boolean).join(' · ') || null} />
        </Grupo>

        <Grupo titulo="EQUIPE E VEÍCULO" icone="account-group-outline">
          <Linha rotulo="Veículo" valor={veiculo ? descreverVeiculo(veiculo) : null} />
          <Linha rotulo="Auxiliar" valor={auxiliares.join(', ') || null} />
          <Linha rotulo="Jornada" valor={ficha?.inicio_jornada
            ? `Seg–Qui ${hhmm(ficha.inicio_jornada)} às ${hhmm(ficha.fim_jornada)} · Sex até ${hhmm(ficha.fim_jornada_sexta)}` : null} />
          <Linha rotulo="Horas extras" valor={ficha?.regime_horas ? (ficha.regime_horas === 'banco_horas' ? 'Banco de horas' : 'Hora extra') : null} />
        </Grupo>

        <Grupo titulo="UNIFORME E EPI" icone="tshirt-crew-outline">
          <Linha rotulo="Camisa" valor={ficha?.tamanho_camisa} />
          <Linha rotulo="Calça" valor={ficha?.tamanho_calca} />
          <Linha rotulo="Calçado" valor={ficha?.tamanho_calcado} />
        </Grupo>

        <Text style={s.nota}>Os dados são cadastrados pelo supervisor no painel. Se algo estiver errado ou em branco, avise o supervisor.</Text>
      </ScrollView>
    </View>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <View style={s.dado}>
      <Text style={s.dadoRotulo}>{rotulo}</Text>
      <Text style={[s.dadoValor, !valor && s.vazio]} numberOfLines={1}>{valor || 'Não informado'}</Text>
    </View>
  );
}

function Grupo({ titulo, icone, children }: { titulo: string; icone: NomeIcone; children: ReactNode }) {
  return (
    <>
      <View style={s.secao}>
        <Icone nome={icone} tamanho={15} cor={cores.suave} />
        <Text style={s.secaoTexto}>{titulo}</Text>
      </View>
      <View style={s.grupo}>{children}</View>
    </>
  );
}

function Linha({ rotulo, valor, alerta }: { rotulo: string; valor: string | null | undefined; alerta?: string }) {
  return (
    <View style={s.linha}>
      <Text style={s.linhaRotulo}>{rotulo}</Text>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
        {alerta ? <Text style={s.alerta}>{alerta}</Text> : null}
        <Text style={[s.linhaValor, !valor && s.vazio]}>{valor || 'Não informado'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cracha: { backgroundColor: cores.cartao, marginHorizontal: 24, marginTop: -60, borderRadius: 24, overflow: 'hidden', alignItems: 'center',
    shadowColor: '#0F2747', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  crachaTopo: { alignSelf: 'stretch', height: 92, alignItems: 'center', paddingTop: 16, overflow: 'hidden' },
  empresa: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.6, paddingHorizontal: 16 },
  setor: { color: cores.cabecalhoSuave, fontSize: 11.5, marginTop: 3, letterSpacing: 0.4 },
  avatarBorda: { marginTop: -46, padding: 5, borderRadius: 52, backgroundColor: cores.cartao },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: 1 },
  nome: { fontSize: 19, fontWeight: '800', color: cores.texto, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  cargo: { fontSize: 13.5, color: cores.suave, marginTop: 3, textAlign: 'center', paddingHorizontal: 16 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  chipTexto: { fontSize: 12, fontWeight: '700' },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  crachaGrade: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', marginTop: 16, borderTopWidth: 1, borderTopColor: cores.linha },
  dado: { width: '50%', paddingHorizontal: 16, paddingVertical: 10 },
  dadoRotulo: { fontSize: 10.5, fontWeight: '700', color: cores.apagado, letterSpacing: 0.6 },
  dadoValor: { fontSize: 14, fontWeight: '600', color: cores.texto, marginTop: 2 },
  crachaRodape: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', justifyContent: 'center',
    backgroundColor: '#F7F8FA', paddingVertical: 10, borderTopWidth: 1, borderTopColor: cores.linha },
  rodapeTexto: { fontSize: 11.5, color: cores.apagado, letterSpacing: 0.3 },
  secao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, marginTop: 22, marginBottom: 8 },
  secaoTexto: { color: cores.suave, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  grupo: { backgroundColor: cores.cartao, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden', ...sombra },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: cores.linha },
  linhaRotulo: { fontSize: 13.5, color: cores.suave },
  linhaValor: { fontSize: 14, fontWeight: '600', color: cores.texto, textAlign: 'right', flexShrink: 1 },
  vazio: { color: cores.apagado, fontWeight: '400', fontStyle: 'italic' },
  alerta: { fontSize: 11, fontWeight: '700', color: cores.perigo, backgroundColor: '#FDECEC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  curso: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: cores.linha },
  cursoNome: { fontSize: 14.5, fontWeight: '700', color: cores.texto },
  cursoSub: { fontSize: 12, color: cores.suave, marginTop: 2 },
  cursoValidade: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  pdf: { alignItems: 'center', justifyContent: 'center', width: 58, height: 52, borderRadius: 12, backgroundColor: cores.selecionado },
  pdfTexto: { fontSize: 11, fontWeight: '700', color: cores.primaria, marginTop: 1 },
  semCurso: { fontSize: 13, color: cores.apagado, fontStyle: 'italic', padding: 16 },
  nota: { fontSize: 12, color: cores.apagado, textAlign: 'center', marginHorizontal: 32, marginTop: 20 },
});
