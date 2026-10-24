"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { baixarXlsx } from "@/lib/planilha";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Item = {
  id: string; tecnico_id: string; tecnico: string; categoria: "ferramenta" | "epi"; nome: string; marca_modelo: string | null;
  numero_serie: string | null; patrimonio: string | null; validade: string | null; liberada_em: string; observacao: string | null;
  ultima_inspecao: string | null; ultima_condicao: string | null; ultima_foto: string | null; ultima_observacao: string | null;
  proxima_ate: string; ciclo: "pendente" | "vencida" | "vence_em_breve" | "em_dia";
};
type Inspecao = { id: string; feita_em: string; condicao: string; observacao: string | null; foto: string | null };

const SUGESTOES = {
  ferramenta: ["Máquina de fusão", "Clivador", "OTDR", "Power meter", "Fonte de luz", "Caneta VFL (laser)", "Catraca", "Chave de fenda",
    "Chave Phillips", "Chave de BAP", "Decapador de fibra", "Alicate de corte", "Estilete", "Kit de limpeza de conectores", "Escada", "Lanterna"],
  epi: ["Capacete com jugular", "Óculos de proteção", "Luva de vaqueta", "Luva isolante", "Botina de segurança", "Cinto paraquedista",
    "Talabarte", "Trava-quedas", "Colete refletivo", "Protetor auricular", "Cone de sinalização"],
};
const CICLO: Record<Item["ciclo"], { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Sem foto", cor: "bg-red-100 text-red-800" },
  vencida: { rotulo: "Vencida", cor: "bg-red-100 text-red-800" },
  vence_em_breve: { rotulo: "Vence em breve", cor: "bg-amber-100 text-amber-800" },
  em_dia: { rotulo: "Em dia", cor: "bg-green-100 text-green-800" },
};
const CONDICAO: Record<string, string> = { ok: "OK", avariada: "Avariada", faltando: "Faltando" };
const br = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR") : "—");
const hoje = () => new Date().toISOString().slice(0, 10);
const vazio = { tecnico_id: "", categoria: "ferramenta" as "ferramenta" | "epi", nome: "", marca_modelo: "", numero_serie: "", patrimonio: "", validade: "", liberada_em: hoje(), observacao: "" };

// Inventário Matinal (ciclo de 30 dias): o que foi liberado a cada técnico e a foto mensal de cada item.
export default function Ferramental({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [tecnico, setTecnico] = useState("");
  const [ciclo, setCiclo] = useState("");
  const [form, setForm] = useState(vazio);
  const [aberto, setAberto] = useState<Item | null>(null);
  const [historico, setHistorico] = useState<(Inspecao & { url?: string })[]>([]);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("inventario_situacao").select("*").order("tecnico").order("categoria").order("nome").then(async ({ data }) => {
      const lista = (data as Item[]) ?? [];
      setItens(lista);
      const caminhos = lista.map((i) => i.ultima_foto).filter((c): c is string => !!c);
      if (!caminhos.length) return setFotos({});
      const { data: assinados } = await supabase.storage.from("inventario").createSignedUrls(caminhos, 7 * 86400);
      setFotos(Object.fromEntries((assinados ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string])));
    });
  }, [versao]);

  useEffect(() => {
    const canal = supabase.channel("inventario")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inventario_inspecoes" }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recarregar]);

  useEffect(() => {
    if (!aberto) return;
    supabase.from("inventario_inspecoes").select("id, feita_em, condicao, observacao, foto").eq("ferramenta_id", aberto.id)
      .order("feita_em", { ascending: false }).then(async ({ data }) => {
        const lista = (data as Inspecao[]) ?? [];
        const caminhos = lista.map((i) => i.foto).filter((c): c is string => !!c);
        const { data: assinados } = caminhos.length
          ? await supabase.storage.from("inventario").createSignedUrls(caminhos, 3600) : { data: [] };
        const urls = new Map((assinados ?? []).map((s) => [s.path, s.signedUrl]));
        setHistorico(lista.map((i) => ({ ...i, url: i.foto ? urls.get(i.foto) ?? undefined : undefined })));
      });
  }, [aberto]);

  const filtrados = useMemo(() => itens.filter((i) => (!tecnico || i.tecnico_id === tecnico)
    && (!ciclo || (ciclo === "atrasado" ? i.ciclo === "vencida" || i.ciclo === "pendente" : ciclo === "problema" ? i.ultima_condicao && i.ultima_condicao !== "ok" : i.ciclo === ciclo))),
  [itens, tecnico, ciclo]);

  const resumo = useMemo(() => ({
    total: filtrados.length,
    emDia: filtrados.filter((i) => i.ciclo === "em_dia").length,
    breve: filtrados.filter((i) => i.ciclo === "vence_em_breve").length,
    atrasados: filtrados.filter((i) => i.ciclo === "vencida" || i.ciclo === "pendente").length,
    problemas: filtrados.filter((i) => i.ultima_condicao && i.ultima_condicao !== "ok").length,
  }), [filtrados]);

  const porTecnico = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of filtrados) m.set(i.tecnico, [...(m.get(i.tecnico) ?? []), i]);
    return [...m.entries()];
  }, [filtrados]);

  async function liberar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("ferramentas").insert({
      tecnico_id: form.tecnico_id, categoria: form.categoria, nome: form.nome.trim(),
      marca_modelo: form.marca_modelo.trim() || null, numero_serie: form.numero_serie.trim() || null,
      patrimonio: form.patrimonio.trim() || null, validade: form.validade || null, liberada_em: form.liberada_em || hoje(),
      observacao: form.observacao.trim() || null,
    });
    if (error) return alert(error.message);
    setForm({ ...vazio, tecnico_id: form.tecnico_id, categoria: form.categoria });
    recarregar();
  }

  async function encerrar(i: Item, situacao: "devolvida" | "baixada") {
    const motivo = prompt(situacao === "devolvida" ? `Devolução de "${i.nome}" (${i.tecnico}). Observação:` : `Baixa de "${i.nome}" (perda, quebra...). Motivo:`);
    if (motivo === null) return;
    const { error } = await supabase.from("ferramentas").update({
      situacao, observacao: [i.observacao, `${situacao === "devolvida" ? "Devolvida" : "Baixada"} em ${br(hoje())}${motivo.trim() ? `: ${motivo.trim()}` : ""}`].filter(Boolean).join(" | "),
    }).eq("id", i.id);
    if (error) return alert(error.message);
    setAberto(null);
    recarregar();
  }

  async function exportar() {
    const cab = ["Técnico", "Categoria", "Item", "Marca / modelo", "Nº de série", "Patrimônio", "Validade", "Liberada em",
      "Última foto", "Condição", "Observação da inspeção", "Ciclo", "Próxima foto até", "Foto"];
    const linhas = filtrados.map((i) => [
      i.tecnico, i.categoria === "epi" ? "EPI" : "Ferramenta", i.nome, i.marca_modelo, i.numero_serie, i.patrimonio,
      i.validade ? new Date(`${i.validade}T12:00:00`) : null, new Date(`${i.liberada_em}T12:00:00`),
      i.ultima_inspecao ? new Date(i.ultima_inspecao) : null, i.ultima_condicao ? CONDICAO[i.ultima_condicao] : null, i.ultima_observacao,
      CICLO[i.ciclo].rotulo, new Date(i.proxima_ate), i.ultima_foto && fotos[i.ultima_foto] ? { texto: "Abrir foto", url: fotos[i.ultima_foto] } : null,
    ]);
    await baixarXlsx(`Inventario Matinal ${hoje()}`, "Inventário", cab, linhas);
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  const card = "rounded-xl border border-gray-200 bg-white p-4";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Inventário Matinal de ferramentas e EPI <span className="font-normal text-gray-500">(ciclo 30 dias)</span></h2>
        <select className={campo} value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <select className={campo} value={ciclo} onChange={(e) => setCiclo(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="atrasado">Sem foto / vencidos</option>
          <option value="vence_em_breve">Vence em breve</option>
          <option value="em_dia">Em dia</option>
          <option value="problema">Avariado / faltando</option>
        </select>
        <button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!filtrados.length}
          onClick={exportar}>Baixar planilha (Excel)</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className={card}><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Itens liberados</div><div className="mt-1 text-2xl font-semibold">{resumo.total}</div></div>
        <div className={card}><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Em dia</div><div className="mt-1 text-2xl font-semibold text-green-700">{resumo.emDia}</div></div>
        <div className={card}><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Vence em até 5 dias</div><div className="mt-1 text-2xl font-semibold text-amber-600">{resumo.breve}</div></div>
        <div className={card}><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Sem foto / vencidos</div><div className={`mt-1 text-2xl font-semibold ${resumo.atrasados ? "text-red-700" : ""}`}>{resumo.atrasados}</div></div>
        <div className={card}><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Avariados / faltando</div><div className={`mt-1 text-2xl font-semibold ${resumo.problemas ? "text-red-700" : ""}`}>{resumo.problemas}</div></div>
      </div>

      <form onSubmit={liberar} className={`${card} grid gap-2`}>
        <h3 className="font-semibold">Liberar item para o técnico</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className={campo} value={form.tecnico_id} onChange={(e) => setForm({ ...form, tecnico_id: e.target.value })} required>
            <option value="">Técnico *</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select className={campo} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as "ferramenta" | "epi" })}>
            <option value="ferramenta">Ferramenta</option>
            <option value="epi">EPI</option>
          </select>
          <input className={`${campo} lg:col-span-2`} list="sugestoes-itens" placeholder="Item * (ex.: Máquina de fusão)" value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <datalist id="sugestoes-itens">{SUGESTOES[form.categoria].map((n) => <option key={n} value={n} />)}</datalist>
          <input className={campo} placeholder="Marca / modelo" value={form.marca_modelo} onChange={(e) => setForm({ ...form, marca_modelo: e.target.value })} />
          <input className={campo} placeholder="Nº de série" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} />
          <input className={campo} placeholder="Patrimônio" value={form.patrimonio} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-gray-500">{form.categoria === "epi" ? "Validade do CA" : "Calibração até"}
            <input type="date" className={`${campo} flex-1 text-gray-900`} value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">Liberada em
            <input type="date" className={`${campo} flex-1 text-gray-900`} value={form.liberada_em} onChange={(e) => setForm({ ...form, liberada_em: e.target.value })} />
          </label>
          <input className={`${campo} lg:col-span-2`} placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Liberar</button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {SUGESTOES[form.categoria].map((n) => (
            <button type="button" key={n} onClick={() => setForm({ ...form, nome: n })}
              className={`rounded-full border px-2.5 py-1 ${form.nome === n ? "border-blue-700 bg-blue-50 text-blue-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>{n}</button>
          ))}
        </div>
      </form>

      {porTecnico.length === 0 && <p className="text-sm text-gray-500">Nenhum item liberado com esses filtros.</p>}
      {porTecnico.map(([nome, lista]) => (
        <section key={nome} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <h3 className="flex items-center gap-3 border-b border-gray-200 p-3 font-semibold">
            {nome}
            <span className="text-xs font-normal text-gray-500">
              {lista.length} item(ns) · {lista.filter((i) => i.ciclo === "vencida" || i.ciclo === "pendente").length} sem foto no ciclo
            </span>
          </h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="p-3">Foto</th><th className="p-3">Item</th><th className="p-3">Identificação</th><th className="p-3">Última foto</th>
                <th className="p-3">Condição</th><th className="p-3">Ciclo</th><th className="p-3">Próxima até</th></tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setAberto(i)}>
                  <td className="p-2">
                    {i.ultima_foto && fotos[i.ultima_foto]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fotos[i.ultima_foto]} alt="" className="h-12 w-16 rounded object-cover" />
                      : <div className="flex h-12 w-16 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">sem foto</div>}
                  </td>
                  <td className="p-3"><div className="font-medium">{i.nome}</div><div className="text-xs text-gray-500">{i.categoria === "epi" ? "EPI" : "Ferramenta"}{i.marca_modelo ? ` · ${i.marca_modelo}` : ""}</div></td>
                  <td className="p-3 text-xs">{[i.numero_serie && `S/N ${i.numero_serie}`, i.patrimonio && `Pat. ${i.patrimonio}`].filter(Boolean).join(" · ") || "—"}
                    {i.validade && <div className={new Date(`${i.validade}T23:59:59`) < new Date() ? "font-medium text-red-700" : "text-gray-500"}>validade {br(i.validade)}</div>}
                  </td>
                  <td className="p-3 whitespace-nowrap">{br(i.ultima_inspecao)}</td>
                  <td className={`p-3 ${i.ultima_condicao && i.ultima_condicao !== "ok" ? "font-medium text-red-700" : ""}`}>
                    {i.ultima_condicao ? CONDICAO[i.ultima_condicao] : "—"}
                    {i.ultima_observacao && <div className="text-xs font-normal text-gray-500">{i.ultima_observacao}</div>}
                  </td>
                  <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${CICLO[i.ciclo].cor}`}>{CICLO[i.ciclo].rotulo}</span></td>
                  <td className="p-3 whitespace-nowrap">{br(i.proxima_ate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAberto(null)}>
          <div className="grid max-h-[90vh] w-full max-w-4xl gap-3 overflow-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="mr-auto">
                <h3 className="text-lg font-semibold">{aberto.nome}</h3>
                <p className="text-sm text-gray-500">
                  {aberto.tecnico} · {aberto.categoria === "epi" ? "EPI" : "Ferramenta"} · liberada em {br(aberto.liberada_em)}
                  {aberto.marca_modelo ? ` · ${aberto.marca_modelo}` : ""}{aberto.numero_serie ? ` · S/N ${aberto.numero_serie}` : ""}
                  {aberto.patrimonio ? ` · Pat. ${aberto.patrimonio}` : ""}
                </p>
                {aberto.observacao && <p className="text-sm text-gray-500">{aberto.observacao}</p>}
              </div>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" onClick={() => encerrar(aberto, "devolvida")}>Devolvida</button>
              <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700" onClick={() => encerrar(aberto, "baixada")}>Dar baixa</button>
              <button className="text-gray-500" onClick={() => setAberto(null)}>✕</button>
            </div>
            <h4 className="text-sm font-semibold text-gray-600">Fotos mês a mês ({historico.length})</h4>
            {historico.length === 0 ? <p className="text-sm text-gray-500">O técnico ainda não fotografou este item.</p> : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {historico.map((h) => (
                  <figure key={h.id} className="rounded-lg border border-gray-200 p-2 text-xs">
                    {h.url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <a href={h.url} target="_blank" rel="noreferrer"><img src={h.url} alt="" className="aspect-[4/3] w-full rounded object-cover" /></a>
                      : <div className="flex aspect-[4/3] items-center justify-center rounded bg-gray-100 text-gray-400">sem foto</div>}
                    <figcaption className="mt-1">
                      <b>{new Date(h.feita_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</b> ·{" "}
                      <span className={h.condicao !== "ok" ? "font-semibold text-red-700" : ""}>{CONDICAO[h.condicao]}</span>
                      {h.observacao && <div className="text-gray-500">{h.observacao}</div>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
