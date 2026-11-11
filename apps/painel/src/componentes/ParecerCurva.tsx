"use client";

import { RefObject, useEffect, useRef, useState } from "react";

import { km } from "@/lib/sor";
import { supabase } from "@/lib/supabase";

// Parecer do analista (supervisor) sobre uma curva ou um comparativo: parecer geral, comentários em eventos
// escolhidos, fotos (ex.: potência da fibra) e a recomendação / tomada de decisão. Fica salvo por curva
// (tabela pareceres_curva, fotos no bucket "pareceres") e sai no PDF junto com a análise ou sozinho.

export type Analista = { nome: string; cargo: string; empresa: string; registro: string };
export type EventoParecer = { n: number; km: number; rotulo: string; cor: string; texto?: string };
export type Exportar = "ambos" | "analise" | "parecer";
type FotoParecer = { caminho?: string; url: string; legenda: string };
// Por evento, tudo opcional: tratativa (o que foi feito), comentário do analista e fotos da execução.
type ComentarioEvento = { n: number; km: number; rotulo: string; cor: string; comentario: string; tratativa?: string; fotos?: FotoParecer[] };
type DadosParecer = { eventos: ComentarioEvento[]; fotos: FotoParecer[]; parecer: string; recomendacao: string };
const VAZIO: DadosParecer = { eventos: [], fotos: [], parecer: "", recomendacao: "" };
const MESMO_PONTO_KM = 0.02; // o mesmo evento, mesmo se a numeração mudar (curva toda × só eventos do OTDR)

export function lerAnalista(): Analista {
  let salvo: Partial<Analista> = {};
  try { salvo = JSON.parse(localStorage.getItem("analista-curva") || "{}"); } catch { /* sem dados salvos */ }
  return { nome: salvo.nome ?? "", cargo: salvo.cargo ?? "", empresa: salvo.empresa || "Multivale Engenharia", registro: salvo.registro ?? "" };
}
export function salvarAnalista(a: Analista) {
  try { localStorage.setItem("analista-curva", JSON.stringify(a)); } catch { /* opcional */ }
}

export function useParecer(chave: string | null, titulo: string) {
  const [dados, setDados] = useState<DadosParecer>(VAZIO);
  const [status, setStatus] = useState<"" | "carregando" | "salvando" | "salvo" | "erro">("");
  const mudou = useRef(false);

  useEffect(() => {
    mudou.current = false;
    setDados(VAZIO);
    if (!chave) { setStatus(""); return; }
    let cancelado = false;
    setStatus("carregando");
    (async () => {
      const { data } = await supabase.from("pareceres_curva").select("*").eq("chave", chave).maybeSingle();
      if (cancelado) return;
      if (!data) { setStatus(""); return; }
      const baixar = async (lista: { caminho: string; legenda: string }[] | undefined) => {
        const fotos: FotoParecer[] = [];
        for (const f of lista ?? []) {
          const { data: blob } = await supabase.storage.from("pareceres").download(f.caminho);
          if (blob) fotos.push({ caminho: f.caminho, legenda: f.legenda ?? "", url: URL.createObjectURL(blob) });
        }
        return fotos;
      };
      const fotos = await baixar(data.fotos);
      const eventos: ComentarioEvento[] = [];
      for (const e of (data.eventos ?? []) as (Omit<ComentarioEvento, "fotos"> & { fotos?: { caminho: string; legenda: string }[] })[]) {
        eventos.push({ ...e, fotos: await baixar(e.fotos) });
      }
      if (cancelado) return;
      setDados({ eventos, fotos, parecer: data.parecer ?? "", recomendacao: data.recomendacao ?? "" });
      setStatus("salvo");
    })();
    return () => { cancelado = true; };
  }, [chave]);

  // Salva sozinho um segundo depois da última mudança.
  useEffect(() => {
    if (!chave || !mudou.current) return;
    const t = setTimeout(async () => {
      setStatus("salvando");
      const { error } = await supabase.from("pareceres_curva").upsert({
        chave, titulo, parecer: dados.parecer, recomendacao: dados.recomendacao,
        fotos: guardar(dados.fotos),
        eventos: dados.eventos.map((e) => ({ ...e, fotos: guardar(e.fotos ?? []) })),
        atualizado_em: new Date().toISOString(),
      });
      setStatus(error ? "erro" : "salvo");
    }, 1000);
    return () => clearTimeout(t);
  }, [chave, titulo, dados]);

  const guardar = (fotos: FotoParecer[]) => fotos.filter((f) => f.caminho).map((f) => ({ caminho: f.caminho, legenda: f.legenda }));
  function mudar(f: (d: DadosParecer) => DadosParecer) { mudou.current = true; setDados(f); }

  // kmEvento: a foto vai para aquele evento; sem ele, para as fotos gerais do parecer.
  async function adicionarFotos(arquivos: FileList, kmEvento?: number) {
    for (const arq of Array.from(arquivos)) {
      const blob = await reduzir(arq);
      const foto: FotoParecer = { url: URL.createObjectURL(blob), legenda: "" };
      if (chave) {
        const caminho = `${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("pareceres").upload(caminho, blob, { contentType: "image/jpeg" });
        if (error) alert(`A foto não foi salva no sistema (${error.message}). Ela sai no PDF agora, mas não fica guardada.`);
        else foto.caminho = caminho;
      }
      mudar((d) => (kmEvento == null ? { ...d, fotos: [...d.fotos, foto] }
        : { ...d, eventos: d.eventos.map((e) => (Math.abs(e.km - kmEvento) < MESMO_PONTO_KM ? { ...e, fotos: [...(e.fotos ?? []), foto] } : e)) }));
    }
  }

  const temConteudo = !!(dados.parecer.trim() || dados.recomendacao.trim() || dados.fotos.length || dados.eventos.some(eventoTemConteudo));
  return { dados, mudar, adicionarFotos, status, temConteudo, chave };
}
export type Parecer = ReturnType<typeof useParecer>;

const eventoTemConteudo = (e: ComentarioEvento) => !!(e.comentario.trim() || e.tratativa?.trim() || e.fotos?.length);

// Fotos grandes do celular ficam com até 1600 px no lado maior (PDF leve e upload rápido).
async function reduzir(arq: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(arq);
    const f = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * f), height: Math.round(img.height * f) });
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? arq), "image/jpeg", 0.85));
  } catch {
    return arq;
  }
}

const caixa = "rounded-lg border border-gray-300 px-3 py-2 text-sm";

export function EditorParecer({ p, eventos }: { p: Parecer; eventos: EventoParecer[] }) {
  const [aberto, setAberto] = useState(false);
  const { dados, mudar } = p;
  const comentarioDe = (e: EventoParecer) => dados.eventos.find((c) => Math.abs(c.km - e.km) < MESMO_PONTO_KM);
  function marcar(e: EventoParecer, sim: boolean) {
    mudar((d) => ({
      ...d,
      eventos: sim
        ? [...d.eventos, { n: e.n, km: e.km, rotulo: e.rotulo, cor: e.cor, comentario: "" }].sort((a, b) => a.km - b.km)
        : d.eventos.filter((c) => Math.abs(c.km - e.km) >= MESMO_PONTO_KM),
    }));
  }
  function alterar(e: EventoParecer, mud: Partial<ComentarioEvento>) {
    mudar((d) => ({ ...d, eventos: d.eventos.map((c) => (Math.abs(c.km - e.km) < MESMO_PONTO_KM ? { ...c, n: e.n, rotulo: e.rotulo, cor: e.cor, ...mud } : c)) }));
  }
  const situacao = !p.chave ? "Esta curva não está salva no sistema: o parecer vale enquanto esta janela estiver aberta."
    : p.status === "carregando" ? "Carregando o parecer salvo..." : p.status === "salvando" ? "Salvando..." : p.status === "salvo" ? "✓ Parecer salvo"
      : p.status === "erro" ? "Não foi possível salvar o parecer (só o supervisor pode salvar)." : "O parecer é salvo sozinho enquanto você escreve.";

  return (
    <div className="m-4 rounded-xl border-2 border-[#0572CE]/30 bg-[#F5F9FF] print:hidden">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setAberto(!aberto)}>
        <span className="font-semibold text-[#163A6B]">{aberto ? "▾" : "▸"} Parecer do analista</span>
        <span className="text-xs text-gray-500">{p.temConteudo ? "com conteúdo · " : ""}{situacao}</span>
      </button>
      {aberto ? (
        <div className="grid gap-4 border-t border-[#0572CE]/20 p-4">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-gray-600">Parecer geral sobre a curva</span>
            <textarea rows={4} className={caixa} placeholder="Avaliação do analista sobre a fibra / o enlace."
              value={dados.parecer} onChange={(e) => mudar((d) => ({ ...d, parecer: e.target.value }))} />
          </label>

          <div className="grid gap-2">
            <span className="text-xs font-semibold text-gray-600">Eventos (marque para registrar tratativa, comentário ou fotos; nenhum é obrigatório)</span>
            {eventos.length ? (
              <div className="grid max-h-[520px] gap-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                {eventos.map((e) => {
                  const c = comentarioDe(e);
                  return (
                    <div key={`${e.n}-${e.km}`} className="grid gap-1 rounded-md px-2 py-1 hover:bg-gray-50">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!c} onChange={(ev) => marcar(e, ev.target.checked)} />
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: e.cor }}>{e.n}</span>
                        <b>{km(e.km)}</b><span style={{ color: e.cor }}>{e.rotulo}</span>
                        {e.texto ? <span className="truncate text-xs text-gray-500">· {e.texto}</span> : null}
                      </label>
                      {c ? (
                        <div className="grid gap-2 pb-2 pl-6 md:grid-cols-2">
                          <label className="grid gap-1">
                            <span className="text-xs text-gray-600">Tratativa do evento {e.n} (o que foi feito, opcional)</span>
                            <textarea rows={2} className={caixa} placeholder="Ex.: refeita a fusão; cabo danificado, trocado 30 m" value={c.tratativa ?? ""} onChange={(ev) => alterar(e, { tratativa: ev.target.value })} />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-xs text-gray-600">Comentário / parecer do evento {e.n} (opcional)</span>
                            <textarea rows={2} className={caixa} value={c.comentario} onChange={(ev) => alterar(e, { comentario: ev.target.value })} />
                          </label>
                          <div className="grid gap-1 md:col-span-2">
                            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-600">Fotos do evento {e.n} (opcional)
                              <input type="file" accept="image/*" multiple className="text-xs"
                                onChange={(ev) => { if (ev.target.files?.length) p.adicionarFotos(ev.target.files, e.km); ev.target.value = ""; }} />
                            </label>
                            {c.fotos?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {c.fotos.map((f, j) => (
                                  <div key={f.url} className="grid w-40 gap-1 rounded border border-gray-200 bg-white p-1">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={f.url} alt={f.legenda || `Foto ${j + 1} do evento ${e.n}`} className="h-24 w-full rounded object-cover" />
                                    <input aria-label={`Legenda da foto ${j + 1} do evento ${e.n}`} className="rounded border border-gray-300 px-1.5 py-0.5 text-xs" placeholder="Legenda"
                                      value={f.legenda} onChange={(ev) => alterar(e, { fotos: c.fotos!.map((x, k) => (k === j ? { ...x, legenda: ev.target.value } : x)) })} />
                                    <button className="text-xs text-red-700 hover:underline" onClick={() => alterar(e, { fotos: c.fotos!.filter((_, k) => k !== j) })}>Remover</button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-gray-500">Nenhum evento na curva.</p>}
          </div>

          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-gray-600">Fotos gerais (ex.: potência medida na fibra, OTDR)</span>
              <input type="file" accept="image/*" multiple className="text-sm"
                onChange={(e) => { if (e.target.files?.length) p.adicionarFotos(e.target.files); e.target.value = ""; }} />
            </label>
            {dados.fotos.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {dados.fotos.map((f, i) => (
                  <div key={f.url} className="grid gap-1 rounded-lg border border-gray-200 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.legenda || `Foto ${i + 1}`} className="h-28 w-full rounded object-cover" />
                    <label className="grid gap-0.5">
                      <span className="text-[11px] text-gray-500">Legenda da foto {i + 1}</span>
                      <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Ex.: potência RX fibra 12" value={f.legenda}
                        onChange={(e) => mudar((d) => ({ ...d, fotos: d.fotos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)) }))} />
                    </label>
                    <button className="text-xs text-red-700 hover:underline" onClick={() => mudar((d) => ({ ...d, fotos: d.fotos.filter((_, j) => j !== i) }))}>Remover do parecer</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-gray-600">Recomendação / tomada de decisão</span>
            <textarea rows={4} className={caixa} placeholder="O que fazer para melhorar: refazer fusões, reacomodar caixa, trocar cordão, programar O.S..."
              value={dados.recomendacao} onChange={(e) => mudar((d) => ({ ...d, recomendacao: e.target.value }))} />
          </label>
          <p className="text-xs text-gray-500">A prévia do parecer aparece logo abaixo. Na hora de exportar você escolhe: análise + parecer, só a análise ou só o parecer.</p>
        </div>
      ) : null}
    </div>
  );
}

export function Assinatura({ analista }: { analista: Analista }) {
  return (
    <div className="flex flex-wrap items-end gap-6 border-t border-gray-200 pt-3" style={{ breakInside: "avoid" }}>
      {([["Analista", analista.nome], ["Cargo / função", analista.cargo], ["Empresa", analista.empresa], ["Registro", analista.registro]] as const)
        .filter(([, v]) => v).map(([r, v]) => <div key={r}><div className="text-xs text-gray-500">{r}</div><div className="font-semibold">{v}</div></div>)}
      <div className="ml-auto w-56 border-t border-gray-700 pt-1 text-center text-xs">Assinatura</div>
    </div>
  );
}

// O parecer como sai no PDF (também serve de prévia na tela).
export function DocumentoParecer({ p, titulo, resumo, analista, docRef, oculto }: {
  p: Parecer; titulo: string; resumo?: string; analista: Analista | null; docRef: RefObject<HTMLDivElement | null>; oculto?: boolean;
}) {
  if (!p.temConteudo) return null;
  const { dados } = p;
  const comentados = dados.eventos.filter(eventoTemConteudo);
  return (
    <div className={`border-t-4 border-[#0572CE]/20 ${oculto ? "print:hidden" : "print:break-before-page"}`}>
      <div className="px-4 pt-3 text-xs font-semibold uppercase text-gray-400 print:hidden">Prévia do parecer</div>
      <div ref={docRef} className="grid gap-4 bg-white p-4 text-sm">
        <div>
          <div className="text-base font-semibold">Parecer técnico · {titulo}</div>
          <div className="text-xs text-gray-500">Técnico Plus · Multivale Backbone · emitido em {new Date().toLocaleString("pt-BR")}</div>
          {resumo ? <div className="mt-1 text-xs text-gray-600">{resumo}</div> : null}
        </div>
        {dados.parecer.trim() ? (
          <div><div className="text-xs font-semibold uppercase text-[#0572CE]">Parecer do analista</div><p className="whitespace-pre-wrap">{dados.parecer}</p></div>
        ) : null}
        {comentados.length ? (
          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase text-[#0572CE]">Eventos tratados / comentados</div>
            {comentados.map((e) => (
              <div key={e.km} className="grid gap-2 rounded-lg border border-gray-200 p-3" style={{ breakInside: "avoid" }}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: e.cor }}>{e.n}</span>
                  <b>{km(e.km)}</b>
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${e.cor}1F`, color: e.cor }}>{e.rotulo}</span>
                </div>
                {e.tratativa?.trim() ? <p className="whitespace-pre-wrap"><b>Tratativa:</b> {e.tratativa}</p> : null}
                {e.comentario.trim() ? <p className="whitespace-pre-wrap"><b>Comentário:</b> {e.comentario}</p> : null}
                {e.fotos?.length ? (
                  <div className="grid grid-cols-4 gap-2">
                    {e.fotos.map((f, j) => (
                      <figure key={f.url} className="grid gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.legenda || `Foto ${j + 1}`} className="h-36 w-full rounded border border-gray-200 object-contain" />
                        <figcaption className="text-xs text-gray-600">{f.legenda || `Foto ${j + 1}`}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {dados.fotos.length ? (
          <div>
            <div className="text-xs font-semibold uppercase text-[#0572CE]">Fotos gerais</div>
            <div className="mt-1 grid grid-cols-3 gap-3">
              {dados.fotos.map((f, i) => (
                <figure key={f.url} className="grid gap-1" style={{ breakInside: "avoid" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.legenda || `Foto ${i + 1}`} className="h-52 w-full rounded border border-gray-200 object-contain" />
                  <figcaption className="text-xs text-gray-600">Foto {i + 1}{f.legenda ? ` · ${f.legenda}` : ""}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
        {dados.recomendacao.trim() ? (
          <div className="rounded-lg border-l-4 border-[#163A6B] bg-[#F5F9FF] px-3 py-2" style={{ breakInside: "avoid" }}>
            <div className="text-xs font-semibold uppercase text-[#163A6B]">Recomendação / tomada de decisão</div>
            <p className="whitespace-pre-wrap">{dados.recomendacao}</p>
          </div>
        ) : null}
        {analista?.nome ? <Assinatura analista={analista} /> : null}
      </div>
    </div>
  );
}

// Antes de exportar: o que vai no arquivo e quem assina.
export function ModalExportar({ analista, setAnalista, temParecer, escolha, setEscolha, rotulo, confirmar, fechar }: {
  analista: Analista; setAnalista: (a: Analista) => void; temParecer: boolean; escolha: Exportar; setEscolha: (e: Exportar) => void;
  rotulo: string; confirmar: () => void; fechar: () => void;
}) {
  const opcoes: [Exportar, string][] = [["ambos", "Análise + parecer"], ["analise", "Só a análise"], ["parecer", "Só o parecer"]];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <form className="grid w-full max-w-md gap-3 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); salvarAnalista(analista); confirmar(); }}>
        <div>
          <h3 className="font-semibold">Exportar relatório</h3>
          <p className="text-xs text-gray-500">{temParecer ? "Escolha o que vai no arquivo." : "Ainda não há parecer escrito: sai só a análise. Abra \"Parecer do analista\" para escrever um."}</p>
        </div>
        {temParecer ? (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-gray-600">Conteúdo</legend>
            {opcoes.map(([v, t]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name="exportar" checked={escolha === v} onChange={() => setEscolha(v)} /> {t}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="text-xs font-medium text-gray-600">Dados do analista (saem no campo de assinatura)</div>
        {([["nome", "Nome do analista"], ["cargo", "Cargo / função"], ["empresa", "Empresa"], ["registro", "Registro (CREA, matrícula...)"]] as [keyof Analista, string][]).map(([k, r]) => (
          <label key={k} className="grid gap-1 text-sm">
            <span className="text-xs text-gray-600">{r}</span>
            <input className="rounded-lg border border-gray-300 px-3 py-2" value={analista[k]} onChange={(e) => setAnalista({ ...analista, [k]: e.target.value })} />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={fechar}>Cancelar</button>
          <button type="submit" className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">{rotulo}</button>
        </div>
      </form>
    </div>
  );
}
