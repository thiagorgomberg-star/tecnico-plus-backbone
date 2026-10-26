"use client";

import { useEffect, useState } from "react";

import AnaliseSor from "@/componentes/AnaliseSor";
import { supabase } from "@/lib/supabase";

type Rota = { id: string; trecho: string; regiao: string; extensao_km?: number | null };
type Curva = { rota_id: string; origem: "arquivo" | "campo"; tirada_em: string; bucket: string; caminho: string; nome: string; fibra: number | null; ponta: string | null };
type Aberta = { nome: string; extensaoKm: number | null; arquivo?: File; bucket?: string; caminho?: string; salvaId?: string };
type Analisada = {
  id: string; nome_arquivo: string; caminho_arquivo: string; rota_id: string | null; comprimento_km: number | null;
  perda_total_db: number | null; criticos: number | null; atencao: number | null; criado_em: string;
};

// Ferramenta do supervisor (igual ao "Analisar curva OTDR" do app): abre um .SOR do computador
// ou uma curva já guardada num trecho e mostra os eventos e o que fazer em cada um.
export default function AnalisarCurva() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [curvas, setCurvas] = useState<Curva[]>([]);
  const [rotaId, setRotaId] = useState("");
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [analisadas, setAnalisadas] = useState<Analisada[]>([]);
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
  async function abrirArquivo(lista: FileList | null) {
    const arquivo = lista?.[0];
    if (!arquivo) return;
    setAberta({ nome: arquivo.name, arquivo, extensaoKm: rota?.extensao_km ?? null });
    const { data: existente } = await supabase.from("curvas_analisadas").select("id").eq("nome_arquivo", arquivo.name).eq("tamanho_bytes", arquivo.size).maybeSingle();
    if (existente) return setAberta((a) => (a?.arquivo === arquivo ? { ...a, salvaId: existente.id } : a));
    const id = crypto.randomUUID();
    const caminho = `analises/${id}-${arquivo.name.replace(/[^\w.\- ]/g, "_")}`;
    const { error: e1 } = await supabase.storage.from("curvas").upload(caminho, arquivo, { contentType: "application/octet-stream" });
    if (e1) return alert(`A análise abriu, mas a curva não foi guardada: ${e1.message}`);
    const { error: e2 } = await supabase.from("curvas_analisadas").insert({ id, nome_arquivo: arquivo.name, caminho_arquivo: caminho, tamanho_bytes: arquivo.size, rota_id: rotaId || null });
    if (e2) return alert(`A análise abriu, mas a curva não foi guardada: ${e2.message}`);
    setAberta((a) => (a?.arquivo === arquivo ? { ...a, salvaId: id } : a));
    carregarAnalisadas();
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
            <span className="font-medium text-gray-700">Arquivo .SOR do computador</span>
            <input type="file" accept=".sor,.SOR" className="rounded-lg border border-gray-300 p-1.5" onChange={(e) => { abrirArquivo(e.target.files); e.target.value = ""; }} />
          </label>
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
                  <button className="ml-auto rounded-lg bg-[#163A6B] px-3 py-1.5 text-white hover:opacity-90"
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
                  <span className="ml-auto flex gap-2">
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

      {aberta && (
        <AnaliseSor key={aberta.caminho ?? aberta.nome} nome={aberta.nome} arquivo={aberta.arquivo} bucket={aberta.bucket} caminho={aberta.caminho}
          extensaoKm={aberta.extensaoKm} fechar={() => setAberta(null)} aoAnalisar={(r) => guardarResumo(aberta.salvaId, r)} />
      )}
    </section>
  );
}
