"use client";

import { useEffect, useState } from "react";

import AnaliseSor from "@/componentes/AnaliseSor";
import ComparaCurvas, { CurvaParaComparar } from "@/componentes/ComparaCurvas";
import { supabase } from "@/lib/supabase";

type Rota = { id: string; trecho: string; regiao: string; extensao_km?: number | null };
type Curva = { rota_id: string; origem: "arquivo" | "campo"; tirada_em: string; bucket: string; caminho: string; nome: string; fibra: number | null; ponta: string | null };
type Aberta = { nome: string; extensaoKm: number | null; arquivo?: File; bucket?: string; caminho?: string; salvaId?: string };
type Analisada = {
  id: string; nome_arquivo: string; caminho_arquivo: string; rota_id: string | null; comprimento_km: number | null;
  perda_total_db: number | null; criticos: number | null; atencao: number | null; criado_em: string;
  fibra: string | null; sentido: "AB" | "BA" | null; momento: "antes" | "depois" | null;
};

// Ferramenta do supervisor (igual ao "Analisar curva OTDR" do app): abre um .SOR do computador
// ou uma curva já guardada num trecho e mostra os eventos e o que fazer em cada um.
export default function AnalisarCurva() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [curvas, setCurvas] = useState<Curva[]>([]);
  const [rotaId, setRotaId] = useState("");
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [analisadas, setAnalisadas] = useState<Analisada[]>([]);
  // Curvas marcadas para o comparativo (A→B × B→A ou antes × depois).
  const [selecao, setSelecao] = useState<CurvaParaComparar[]>([]);
  const [comparando, setComparando] = useState(false);
  const marcada = (chave: string) => selecao.some((c) => c.chave === chave);
  const alternar = (c: CurvaParaComparar) => setSelecao((l) => (l.some((x) => x.chave === c.chave) ? l.filter((x) => x.chave !== c.chave) : [...l, c]));
  const daAnalisada = (c: Analisada): CurvaParaComparar => ({
    chave: `a:${c.id}`, nome: c.nome_arquivo, bucket: "curvas", caminho: c.caminho_arquivo, salvaId: c.id,
    fibra: c.fibra ?? "", sentido: c.sentido ?? "", momento: c.momento ?? "",
  });
  function mudarCurva(chave: string, m: Partial<Pick<CurvaParaComparar, "fibra" | "sentido" | "momento">>) {
    setSelecao((l) => l.map((c) => (c.chave === chave ? { ...c, ...m } : c)));
    const c = selecao.find((x) => x.chave === chave);
    if (c?.salvaId) {
      const dados: Record<string, string | null> = {};
      if (m.fibra !== undefined) dados.fibra = m.fibra.trim() || null;
      if (m.sentido !== undefined) dados.sentido = m.sentido || null;
      if (m.momento !== undefined) dados.momento = m.momento || null;
      supabase.from("curvas_analisadas").update(dados).eq("id", c.salvaId).then(() => carregarAnalisadas());
    }
  }
  const carregarAnalisadas = () => supabase.from("curvas_analisadas").select("*").order("criado_em", { ascending: false }).limit(50)
    .then(({ data }) => setAnalisadas((data as Analisada[]) ?? []));

  useEffect(() => {
    supabase.from("rotas").select("id, trecho, regiao, extensao_km").eq("ativo", true).order("regiao").order("trecho").then(({ data }) => setRotas(data ?? []));
    carregarAnalisadas();
    supabase.rpc("curvas_trecho", { p_limite: 10 }).then(({ data }) => setCurvas(((data as Curva[]) ?? []).filter((c) => c.origem === "arquivo" && /\.sor$/i.test(c.nome))));
  }, []);

  const rota = rotas.find((r) => r.id === rotaId) ?? null;
  const daRota = curvas.filter((c) => !rotaId || c.rota_id === rotaId);
  const trechoDe = (id: string) => rotas.find((r) => r.id === id);

  // A curva aberta do computador fica guardada (mesmo nome e tamanho não duplica) para abrir e compartilhar depois.
  async function guardar(arquivo: File): Promise<Analisada | null> {
    const { data: existente } = await supabase.from("curvas_analisadas").select("*").eq("nome_arquivo", arquivo.name).eq("tamanho_bytes", arquivo.size).maybeSingle();
    if (existente) return existente as Analisada;
    const id = crypto.randomUUID();
    const caminho = `analises/${id}-${arquivo.name.replace(/[^\w.\- ]/g, "_")}`;
    const { error: e1 } = await supabase.storage.from("curvas").upload(caminho, arquivo, { contentType: "application/octet-stream" });
    if (e1) { alert(`A curva "${arquivo.name}" não foi guardada: ${e1.message}`); return null; }
    const { data, error: e2 } = await supabase.from("curvas_analisadas")
      .insert({ id, nome_arquivo: arquivo.name, caminho_arquivo: caminho, tamanho_bytes: arquivo.size, rota_id: rotaId || null }).select("*").single();
    if (e2) { alert(`A curva "${arquivo.name}" não foi guardada: ${e2.message}`); return null; }
    return data as Analisada;
  }
  async function abrirArquivo(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (!arquivos.length) return;
    if (arquivos.length === 1) {
      const arquivo = arquivos[0];
      setAberta({ nome: arquivo.name, arquivo, extensaoKm: rota?.extensao_km ?? null });
      const salva = await guardar(arquivo);
      if (salva) setAberta((a) => (a?.arquivo === arquivo ? { ...a, salvaId: salva.id } : a));
      carregarAnalisadas();
      return;
    }
    // Várias curvas de uma vez: guarda todas e abre o comparativo com elas.
    const salvas = (await Promise.all(arquivos.map(guardar))).filter((c): c is Analisada => !!c);
    setSelecao((l) => [...l.filter((c) => !salvas.some((x) => `a:${x.id}` === c.chave)), ...salvas.map(daAnalisada)]);
    carregarAnalisadas();
    setComparando(true);
  }

  async function guardarResumo(id: string | undefined, r: { comprimentoKm: number; perdaTotalDb: number; criticos: number; atencao: number }) {
    if (!id) return;
    await supabase.from("curvas_analisadas").update({ comprimento_km: r.comprimentoKm, perda_total_db: r.perdaTotalDb, criticos: r.criticos, atencao: r.atencao }).eq("id", id);
    carregarAnalisadas();
  }

  async function remover(c: Analisada) {
    if (!confirm(`Remover a curva "${c.nome_arquivo}" das analisadas?`)) return;
    await supabase.storage.from("curvas").remove([c.caminho_arquivo]);
    const { error } = await supabase.from("curvas_analisadas").delete().eq("id", c.id);
    if (error) return alert(error.message);
    carregarAnalisadas();
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold">Analisar curva OTDR</h2>
        <p className="mt-1 text-sm text-gray-500">Abra um arquivo .SOR do computador ou uma curva já guardada num trecho. A curva aberta do computador fica guardada em "Curvas analisadas" para abrir de novo.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700">Trecho (opcional: compara com a extensão da rota)</span>
            <select className="rounded-lg border border-gray-300 p-2" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Sem trecho</option>
              {rotas.map((r) => <option key={r.id} value={r.id}>{r.regiao} · {r.trecho}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700">Arquivo(s) .SOR do computador (vários abrem o comparativo)</span>
            <input type="file" multiple accept=".sor,.SOR" className="rounded-lg border border-gray-300 p-1.5" onChange={(e) => { abrirArquivo(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[#163A6B]/5 p-3 text-sm">
          <span className="flex-1">
            <b>Comparar curvas:</b> marque “Comparar” nas curvas abaixo (A → B e B → A, ou antes e depois da mesma fibra), ou escolha vários arquivos de uma vez.
            {selecao.length ? ` ${selecao.length} marcada(s).` : ""}
          </span>
          {selecao.length ? <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50" onClick={() => setSelecao([])}>Limpar</button> : null}
          <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50" disabled={selecao.length < 2} onClick={() => setComparando(true)}>
            Comparar ({selecao.length})
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <h3 className="border-b border-gray-200 p-4 font-semibold">Curvas guardadas nos trechos{rota ? ` · ${rota.trecho}` : ""}</h3>
        {daRota.length === 0 ? <p className="p-4 text-sm text-gray-500">Nenhuma curva .SOR guardada{rota ? " neste trecho" : ""}. Envie pela aba Rotas e eventos.</p> : (
          <ul>
            {daRota.map((c) => {
              const r = trechoDe(c.rota_id);
              return (
                <li key={c.caminho} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-3 text-sm last:border-0">
                  <span className="rounded-md bg-[#163A6B]/10 px-2 py-0.5 text-xs font-bold text-[#163A6B]">{r?.regiao ?? "—"}</span>
                  <span className="font-medium">{r?.trecho ?? "Trecho"}</span>
                  <span className="text-gray-600">{c.nome}</span>
                  <span className="text-xs text-gray-500">{new Date(`${c.tirada_em}T12:00:00`).toLocaleDateString("pt-BR")}{c.fibra ? ` · fibra ${c.fibra}` : ""}{c.ponta ? ` · ${c.ponta}` : ""}</span>
                  <label className="ml-auto flex items-center gap-1.5 text-xs font-medium">
                    <input type="checkbox" checked={marcada(`t:${c.caminho}`)} onChange={() => alternar({
                      chave: `t:${c.caminho}`, nome: c.nome, bucket: c.bucket, caminho: c.caminho, fibra: c.fibra ? String(c.fibra) : "", sentido: "", momento: "",
                    })} />
                    Comparar
                  </label>
                  <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-white hover:opacity-90"
                    onClick={() => setAberta({ nome: c.nome, bucket: c.bucket, caminho: c.caminho, extensaoKm: r?.extensao_km ?? null })}>
                    Analisar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <h3 className="border-b border-gray-200 p-4 font-semibold">Curvas analisadas ({analisadas.length})</h3>
        {analisadas.length === 0 ? <p className="p-4 text-sm text-gray-500">Nenhuma ainda. Toda curva aberta do computador aparece aqui.</p> : (
          <ul>
            {analisadas.map((c) => {
              const r = c.rota_id ? trechoDe(c.rota_id) : undefined;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-3 text-sm last:border-0">
                  <span className="font-medium">{c.nome_arquivo}</span>
                  {r && <span className="text-gray-600">{r.regiao} · {r.trecho}</span>}
                  <span className="text-xs text-gray-500">
                    {new Date(c.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {c.comprimento_km != null ? ` · ${Number(c.comprimento_km).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km` : ""}
                    {c.perda_total_db != null ? ` · ${Number(c.perda_total_db).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dB` : ""}
                  </span>
                  {c.criticos ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{c.criticos} crítico(s)</span> : null}
                  {c.fibra || c.sentido || c.momento ? (
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {[c.fibra && `fibra ${c.fibra}`, c.sentido && (c.sentido === "AB" ? "A → B" : "B → A"), c.momento].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium">
                      <input type="checkbox" checked={marcada(`a:${c.id}`)} onChange={() => alternar(daAnalisada(c))} />
                      Comparar
                    </label>
                    <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-white hover:opacity-90"
                      onClick={() => setAberta({ nome: c.nome_arquivo, bucket: "curvas", caminho: c.caminho_arquivo, extensaoKm: r?.extensao_km ?? null, salvaId: c.id })}>
                      Abrir
                    </button>
                    <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-red-700 hover:bg-red-50" onClick={() => remover(c)}>Remover</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {comparando && (
        <ComparaCurvas curvas={selecao} aoMudar={mudarCurva} fechar={() => setComparando(false)}
          analisarSozinha={(c) => setAberta({ nome: c.nome, bucket: c.bucket, caminho: c.caminho, arquivo: c.arquivo, extensaoKm: rota?.extensao_km ?? null, salvaId: c.salvaId })} />
      )}
      {aberta && (
        <AnaliseSor key={aberta.caminho ?? aberta.nome} nome={aberta.nome} arquivo={aberta.arquivo} bucket={aberta.bucket} caminho={aberta.caminho}
          extensaoKm={aberta.extensaoKm} fechar={() => setAberta(null)} aoAnalisar={(r) => guardarResumo(aberta.salvaId, r)} />
      )}
    </section>
  );
}
