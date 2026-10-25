"use client";

import { useEffect, useState } from "react";

import { excluirComConfirmacao } from "@/lib/excluir";
import { supabase } from "@/lib/supabase";

// Ficha completa do técnico (Equipe > nome). Os dados pessoais só são vistos pelo próprio técnico e pelo supervisor.
type Campo = { k: string; rotulo: string; tipo?: string; dica?: string; largo?: boolean };
const SECOES: [string, Campo[]][] = [
  ["Identificação", [
    { k: "nome", rotulo: "Nome completo (sai na foto)" },
    { k: "cargo", rotulo: "Cargo (sai na foto)" },
    { k: "matricula", rotulo: "Matrícula" },
    { k: "cpf", rotulo: "CPF", dica: "000.000.000-00" },
    { k: "rg", rotulo: "RG" },
    { k: "data_nascimento", rotulo: "Data de nascimento", tipo: "date" },
    { k: "data_admissao", rotulo: "Data de admissão", tipo: "date" },
  ]],
  ["Contato", [
    { k: "telefone", rotulo: "Telefone", dica: "(11) 99999-9999" },
    { k: "email_contato", rotulo: "E-mail de contato", tipo: "email" },
    { k: "endereco", rotulo: "Endereço", largo: true },
    { k: "contato_emergencia", rotulo: "Contato de emergência (nome)" },
    { k: "telefone_emergencia", rotulo: "Telefone de emergência" },
  ]],
  ["CNH", [
    { k: "cnh_numero", rotulo: "Número da CNH" },
    { k: "cnh_categoria", rotulo: "Categoria", dica: "B, AB..." },
    { k: "cnh_validade", rotulo: "Validade da CNH", tipo: "date" },
  ]],
  ["Uniforme e EPI", [
    { k: "tamanho_camisa", rotulo: "Camisa", dica: "P, M, G, GG" },
    { k: "tamanho_calca", rotulo: "Calça", dica: "40, 42..." },
    { k: "tamanho_calcado", rotulo: "Calçado / botina", dica: "40, 41..." },
  ]],
  ["Informações complementares", [
    { k: "tipo_sanguineo", rotulo: "Tipo sanguíneo", dica: "O+, A-..." },
    { k: "alergias", rotulo: "Alergias / restrições médicas" },
    { k: "pis", rotulo: "PIS / NIT" },
    { k: "escolaridade", rotulo: "Escolaridade", dica: "Médio, técnico, superior..." },
    { k: "formacao", rotulo: "Formação / especialidades", dica: "Téc. em telecom, fusão, OTDR...", largo: true },
  ]],
];

// Cursos e licenças comuns no backbone, com o tipo e a validade usual (meses) para sugerir o vencimento.
type TipoCurso = "nr" | "profissionalizante" | "licenca";
const TIPOS_CURSO: [TipoCurso, string][] = [["nr", "NR"], ["profissionalizante", "Profissionalizante"], ["licenca", "Licença"]];
const CATALOGO: [string, TipoCurso, number | null][] = [
  ["NR-10 Básico (eletricidade)", "nr", 24], ["NR-10 SEP", "nr", 24], ["NR-35 Trabalho em altura", "nr", 24], ["NR-33 Espaço confinado", "nr", 12],
  ["NR-06 EPI", "nr", null], ["NR-12 Máquinas e equipamentos (motosserra)", "nr", null], ["NR-18 Construção", "nr", null],
  ["NR-11 Movimentação de cargas", "nr", null],
  ["Fusão de fibra óptica", "profissionalizante", null], ["OTDR e certificação de enlaces", "profissionalizante", null],
  ["Redes FTTx / GPON", "profissionalizante", null], ["Lançamento de cabo óptico aéreo e subterrâneo", "profissionalizante", null],
  ["Montagem de caixas de emenda (CEO)", "profissionalizante", null], ["Cabeamento estruturado", "profissionalizante", null],
  ["Técnico em telecomunicações", "profissionalizante", null], ["Operação de motosserra", "profissionalizante", null],
  ["Leitura de projeto e KMZ / Google Earth", "profissionalizante", null],
  ["Direção defensiva", "profissionalizante", 36], ["Primeiros socorros", "profissionalizante", 24], ["Combate a incêndio", "profissionalizante", 12],
  ["LPU – Licença de Porte e Uso de motosserra (IBAMA)", "licenca", 24],
];
type Curso = {
  id: string; tipo: TipoCurso; curso: string; instituicao: string | null; carga_horaria: number | null; data_conclusao: string | null;
  validade: string | null; arquivo: string | null;
};
const somarMeses = (data: string, meses: number) => {
  const [a, m, d] = data.split("-").map(Number);
  const r = new Date(a, m - 1 + meses, d);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}-${String(r.getDate()).padStart(2, "0")}`;
};
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const CAMPOS = SECOES.flatMap(([, c]) => c.map((x) => x.k));

export default function FichaTecnico({ id, fechar, aoSalvar }: { id: string; fechar: () => void; aoSalvar: () => void }) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [novo, setNovo] = useState({ tipo: "nr" as TipoCurso, curso: "", instituicao: "", carga_horaria: "", data_conclusao: "", validade: "" });
  const [pdf, setPdf] = useState<File | null>(null);
  const [enviandoCurso, setEnviandoCurso] = useState(false);
  const [versaoCursos, setVersaoCursos] = useState(0);

  useEffect(() => {
    supabase.from("tecnico_cursos").select("id, tipo, curso, instituicao, carga_horaria, data_conclusao, validade, arquivo").eq("usuario_id", id)
      .order("validade", { nullsFirst: false }).then(({ data }) => setCursos((data as Curso[]) ?? []));
  }, [id, versaoCursos]);

  function escolherCurso(curso: string, conclusao = novo.data_conclusao) {
    const item = CATALOGO.find(([c]) => c === curso);
    const meses = item?.[2];
    setNovo({ ...novo, curso, tipo: item?.[1] ?? novo.tipo, data_conclusao: conclusao, validade: meses && conclusao ? somarMeses(conclusao, meses) : novo.validade });
  }

  async function incluirCurso() {
    if (!novo.curso.trim()) return setErro("Informe o curso.");
    setEnviandoCurso(true);
    const cursoId = crypto.randomUUID();
    let arquivo: string | null = null;
    if (pdf) {
      arquivo = `${id}/${cursoId}.pdf`;
      const envio = await supabase.storage.from("documentos-tecnico").upload(arquivo, pdf, { contentType: "application/pdf", upsert: true });
      if (envio.error) { setEnviandoCurso(false); return setErro(envio.error.message); }
    }
    const { error } = await supabase.from("tecnico_cursos").insert({
      id: cursoId, usuario_id: id, tipo: novo.tipo, arquivo, curso: novo.curso.trim(), instituicao: novo.instituicao.trim() || null,
      carga_horaria: novo.carga_horaria ? Number(novo.carga_horaria) : null,
      data_conclusao: novo.data_conclusao || null, validade: novo.validade || null,
    });
    setEnviandoCurso(false);
    if (error) return setErro(error.message);
    setErro("");
    setNovo({ tipo: novo.tipo, curso: "", instituicao: "", carga_horaria: "", data_conclusao: "", validade: "" });
    setPdf(null);
    setVersaoCursos((v) => v + 1);
  }

  async function abrirPdf(caminho: string) {
    const { data, error } = await supabase.storage.from("documentos-tecnico").createSignedUrl(caminho, 600);
    if (error || !data) return alert(error?.message ?? "Arquivo não encontrado.");
    window.open(data.signedUrl, "_blank");
  }

  async function excluirCurso(c: Curso) {
    const ok = await excluirComConfirmacao(`o item ${c.curso}`, () => supabase.from("tecnico_cursos").delete().eq("id", c.id));
    if (!ok) return;
    if (c.arquivo) await supabase.storage.from("documentos-tecnico").remove([c.arquivo]);
    setVersaoCursos((v) => v + 1);
  }

  useEffect(() => {
    supabase.from("usuarios").select([...CAMPOS, "observacao"].join(", ")).eq("id", id).single().then(({ data }) => {
      if (data) setDados(Object.fromEntries(Object.entries(data as unknown as Record<string, string | null>).map(([k, v]) => [k, v ?? ""])));
    });
  }, [id]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados.nome?.trim()) return setErro("O nome é obrigatório.");
    setSalvando(true);
    const linha = Object.fromEntries([...CAMPOS, "observacao"].map((k) => [k, dados[k]?.trim() || null]));
    const { error } = await supabase.from("usuarios").update(linha).eq("id", id);
    setSalvando(false);
    if (error) return setErro(error.message);
    aoSalvar();
    fechar();
  }

  const vencida = dados.cnh_validade && dados.cnh_validade < new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <form className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="mb-2 flex items-center">
          <h2 className="mr-auto text-lg font-semibold">Ficha do técnico</h2>
          <button type="button" className="text-2xl leading-none text-gray-500" onClick={fechar} aria-label="Fechar">×</button>
        </div>
        {SECOES.map(([titulo, campos]) => (
          <fieldset key={titulo} className="mt-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{titulo}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {campos.map((c) => (
                <label key={c.k} className={`grid gap-1 text-xs text-gray-600 ${c.largo ? "sm:col-span-3" : ""}`}>
                  {c.rotulo}
                  <input type={c.tipo ?? "text"} placeholder={c.dica} value={dados[c.k] ?? ""}
                    className={`rounded-lg border p-2 text-sm text-gray-900 ${c.k === "cnh_validade" && vencida ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                    onChange={(e) => setDados({ ...dados, [c.k]: e.target.value })} />
                </label>
              ))}
            </div>
            {titulo === "CNH" && vencida && <p className="mt-1 text-xs font-medium text-red-700">CNH vencida.</p>}
          </fieldset>
        ))}
        <fieldset className="mt-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Cursos, NRs e licenças</legend>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr><th className="p-2">Tipo</th><th className="p-2">Curso / licença</th><th className="p-2">Instituição</th><th className="p-2">Carga</th><th className="p-2">Conclusão</th><th className="p-2">Validade</th><th className="p-2">PDF</th><th className="p-2" /></tr>
              </thead>
              <tbody>
                {cursos.length === 0 && <tr><td colSpan={8} className="p-2 text-gray-500">Nenhum curso ou licença cadastrado.</td></tr>}
                {cursos.map((c) => {
                  const hoje = new Date().toISOString().slice(0, 10);
                  const vencido = c.validade && c.validade < hoje;
                  const vence = c.validade && !vencido && c.validade <= somarMeses(hoje, 2);
                  return (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="p-2"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{TIPOS_CURSO.find(([v]) => v === c.tipo)?.[1]}</span></td>
                      <td className="p-2 font-medium">{c.curso}</td>
                      <td className="p-2 text-gray-600">{c.instituicao ?? "—"}</td>
                      <td className="p-2 text-gray-600">{c.carga_horaria ? `${c.carga_horaria} h` : "—"}</td>
                      <td className="p-2">{br(c.data_conclusao)}</td>
                      <td className={`p-2 ${vencido ? "font-semibold text-red-700" : vence ? "font-semibold text-amber-700" : ""}`}>
                        {c.validade ? `${br(c.validade)}${vencido ? " (vencido)" : vence ? " (vence logo)" : ""}` : "Sem vencimento"}
                      </td>
                      <td className="p-2">
                        {c.arquivo ? <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => abrirPdf(c.arquivo!)}>Abrir</button> : "—"}
                      </td>
                      <td className="p-2 text-right">
                        <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => excluirCurso(c)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <select className="rounded-lg border border-gray-300 p-2 text-sm" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoCurso })}>
              {TIPOS_CURSO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <input list="catalogo-cursos" className="rounded-lg border border-gray-300 p-2 text-sm sm:col-span-2" placeholder="Curso ou licença (ex.: NR-35, LPU)"
              value={novo.curso} onChange={(e) => escolherCurso(e.target.value)} />
            <datalist id="catalogo-cursos">{CATALOGO.filter(([, t]) => t === novo.tipo).map(([c]) => <option key={c} value={c} />)}</datalist>
            <input className="rounded-lg border border-gray-300 p-2 text-sm" placeholder="Instituição" value={novo.instituicao}
              onChange={(e) => setNovo({ ...novo, instituicao: e.target.value })} />
            <input type="number" min={0} className="rounded-lg border border-gray-300 p-2 text-sm" placeholder="Carga (h)" value={novo.carga_horaria}
              onChange={(e) => setNovo({ ...novo, carga_horaria: e.target.value })} />
            <input type="date" title="Conclusão" className="rounded-lg border border-gray-300 p-2 text-sm" value={novo.data_conclusao}
              onChange={(e) => escolherCurso(novo.curso, e.target.value)} />
            <input type="date" title="Validade (vazio = sem vencimento)" className="rounded-lg border border-gray-300 p-2 text-sm" value={novo.validade}
              onChange={(e) => setNovo({ ...novo, validade: e.target.value })} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600">
              PDF (certificado ou licença)
              <input type="file" accept="application/pdf" className="text-xs" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className="rounded-lg border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              onClick={incluirCurso} disabled={enviandoCurso}>
              {enviandoCurso ? "Enviando..." : "Incluir"}
            </button>
            <span className="text-xs text-gray-500">Validade sugerida a partir da conclusão; pode ajustar. O técnico abre o PDF no app, mesmo sem internet.</span>
          </div>
        </fieldset>
        <label className="mt-3 grid gap-1 text-xs text-gray-600">
          Observações
          <textarea className="min-h-16 rounded-lg border border-gray-300 p-2 text-sm text-gray-900" value={dados.observacao ?? ""}
            onChange={(e) => setDados({ ...dados, observacao: e.target.value })} />
        </label>
        <p className="mt-2 text-xs text-gray-500">Nome, cargo e CPF/RG saem na O.S. de apresentação (abordagem policial).</p>
        <div className="mt-4 flex items-center gap-2">
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar ficha"}
          </button>
          <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={fechar}>Cancelar</button>
          {erro && <span className="text-sm text-red-700">{erro}</span>}
        </div>
      </form>
    </div>
  );
}
