"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { CaixaPainel } from "@/componentes/CaixaDetalhe";
import { calcularPlano, descreverFibra, faixasDaBandeja, rotuloPonto, separarBandejas, svgMapaFusao } from "@/lib/fusao";
import { rotuloStatus, StatusOS } from "@/lib/tipos";

// Relatório do evento aberto pelo link compartilhado com parceiros (sem login).
// Os dados vêm da função relatorio-os, que só responde a um token válido.
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wnuivnpywflczknxpytx.supabase.co";
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dRn1z_bQvs2zqEK_EBSCmQ_trb_hjpG";

type Relatorio = {
  os: {
    numero: number; tipo: string; titulo: string; descricao: string | null; endereco: string | null; status: StatusOS;
    ticket_acionamento: string | null; ticket_interno: boolean; criado_em: string; enviada_em: string | null;
    iniciada_em: string | null; concluida_em: string | null; baixada_em: string | null; observacao_tecnico: string | null;
    tecnico: { nome: string; cargo: string | null } | null; rota: { trecho: string } | null;
  };
  eventos: { status_novo: StatusOS; criado_em: string }[];
  servicos: { quantidade: number; observacao: string | null; item: { nome: string; unidade: string; categoria: string } | null }[];
  apoio: string[];
  fotos: { tirada_em: string | null; url: string | null; tipo?: string; caixa_id?: string | null; fibra?: number | null; bandeja?: number | null; descricao?: string | null }[];
  caixas?: CaixaPainel[];
  local: { latitude: number; longitude: number; evento_localizado_em: string; evento_precisao_m: number | null } | null;
  gerado_em: string;
};

const quando = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmt = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function duracao(inicio: string | null, fim: string | null) {
  if (!inicio || !fim) return "—";
  const min = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

function Conteudo() {
  const token = useSearchParams().get("t") ?? "";
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`${URL_SUPABASE}/functions/v1/relatorio-os?t=${encodeURIComponent(token)}`, { headers: { apikey: CHAVE } })
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? "Não foi possível abrir o relatório.");
        setDados(corpo);
      })
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  if (erro) return <p className="p-10 text-center text-gray-600">{erro}</p>;
  if (!dados) return <p className="p-10 text-center text-gray-500">Carregando relatório...</p>;

  const { os, local } = dados;
  const fotosOs = dados.fotos.filter((f) => !f.tipo || f.tipo === "foto_antes" || f.tipo === "foto_depois");
  const assinatura = [...dados.fotos].reverse().find((f) => f.tipo === "assinatura");
  const origem = (c: CaixaPainel) => c.origem_identificacao ?? (c.origem_dgo ? `DGO ${c.origem_dgo}` : null);
  const secao = "mt-6 break-inside-avoid";
  const titulo = "border-b-2 border-[#0572CE] pb-1 text-sm font-bold uppercase tracking-wide text-[#0572CE]";

  return (
    <main className="mx-auto w-full max-w-4xl bg-white p-8 text-sm text-gray-900 print:p-0">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="rounded-lg bg-[#0572CE] px-4 py-2 font-semibold text-white hover:bg-[#045ba5]">
          Baixar PDF / Imprimir
        </button>
      </div>

      <header className="flex items-center gap-4 border-b border-gray-300 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-multivale.png" alt="Multivale" className="h-14" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Relatório de atendimento</h1>
          <p className="text-gray-600">O.S. #{os.numero} · {os.tipo}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {os.ticket_acionamento && <div>{os.ticket_interno ? "Token" : "Ticket"} <b className="text-gray-800">{os.ticket_acionamento}</b></div>}
          <div>Gerado em {quando(dados.gerado_em)}</div>
        </div>
      </header>

      <section className={secao}>
        <h2 className={titulo}>Atividade</h2>
        <p className="mt-2 text-base font-semibold">{os.titulo}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div><dt className="text-gray-500">Situação</dt><dd>{rotuloStatus[os.status] ?? os.status}</dd></div>
          <div><dt className="text-gray-500">Trecho</dt><dd>{os.rota?.trecho ?? "—"}</dd></div>
          <div className="col-span-2"><dt className="text-gray-500">Endereço / referência</dt><dd>{os.endereco ?? "—"}</dd></div>
          {os.descricao && <div className="col-span-2"><dt className="text-gray-500">Descrição</dt><dd className="whitespace-pre-wrap">{os.descricao}</dd></div>}
        </dl>
      </section>

      <section className={secao}>
        <h2 className={titulo}>Equipe</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div><dt className="text-gray-500">Técnico responsável</dt><dd>{os.tecnico?.nome ?? "—"}{os.tecnico?.cargo ? ` · ${os.tecnico.cargo}` : ""}</dd></div>
          <div><dt className="text-gray-500">Técnicos de apoio</dt><dd>{dados.apoio.length ? dados.apoio.join(", ") : "—"}</dd></div>
        </dl>
      </section>

      <section className={secao}>
        <h2 className={titulo}>Tempos</h2>
        <dl className="mt-2 grid grid-cols-3 gap-x-6 gap-y-1.5">
          <div><dt className="text-gray-500">Abertura</dt><dd>{quando(os.criado_em)}</dd></div>
          <div><dt className="text-gray-500">Despacho</dt><dd>{quando(os.enviada_em)}</dd></div>
          <div><dt className="text-gray-500">Início em campo</dt><dd>{quando(os.iniciada_em)}</dd></div>
          <div><dt className="text-gray-500">Conclusão</dt><dd>{quando(os.concluida_em)}</dd></div>
          <div><dt className="text-gray-500">Tempo em campo</dt><dd>{duracao(os.iniciada_em, os.concluida_em)}</dd></div>
          <div><dt className="text-gray-500">Tempo total</dt><dd>{duracao(os.criado_em, os.concluida_em)}</dd></div>
        </dl>
      </section>

      {local && (
        <section className={secao}>
          <h2 className={titulo}>Local do evento</h2>
          <p className="mt-2">
            <a className="text-[#0572CE] underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${local.latitude},${local.longitude}`}>
              {local.latitude.toFixed(6)}, {local.longitude.toFixed(6)}
            </a>
            <span className="text-gray-500">
              {" "}· registrado em {quando(local.evento_localizado_em)}
              {local.evento_precisao_m != null ? ` · precisão ${Math.round(local.evento_precisao_m)} m` : ""}
            </span>
          </p>
        </section>
      )}

      {(["servico", "material"] as const).map((categoria) => {
        const itens = dados.servicos.filter((s) => s.item?.categoria === categoria);
        if (itens.length === 0) return null;
        return (
          <section key={categoria} className={secao}>
            <h2 className={titulo}>{categoria === "servico" ? "Serviços executados" : "Materiais utilizados"}</h2>
            <table className="mt-2 w-full">
              <tbody>
                {itens.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1">{s.item?.nome}{s.observacao ? <span className="text-gray-500"> · {s.observacao}</span> : null}</td>
                    <td className="py-1 text-right font-medium">{fmt(s.quantidade)} {s.item?.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {os.observacao_tecnico && (
        <section className={secao}>
          <h2 className={titulo}>Observações do técnico</h2>
          <p className="mt-2 whitespace-pre-wrap">{os.observacao_tecnico}</p>
        </section>
      )}

      <section className={secao}>
        <h2 className={titulo}>Linha do tempo</h2>
        <ol className="mt-2">
          {dados.eventos.map((e, i) => (
            <li key={i} className="flex gap-4 py-0.5">
              <span className="w-32 text-gray-500">{quando(e.criado_em)}</span>
              <span>{rotuloStatus[e.status_novo] ?? e.status_novo}</span>
            </li>
          ))}
        </ol>
      </section>

      {(dados.caixas ?? []).map((c) => {
        const ponta = c.tipo === "dgo" || c.tipo === "entroncamento";
        const plano = calcularPlano(c);
        const daCaixa = dados.fotos.filter((f) => f.caixa_id === c.id);
        return (
          <section key={c.id} className="mt-6">
            <h2 className={titulo}>{rotuloPonto(c.tipo)} {c.identificacao}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div><dt className="text-gray-500">Vem de</dt><dd>{origem(c) ?? "—"}</dd></div>
              <div><dt className="text-gray-500">Localização</dt><dd>{c.latitude != null ? `${c.latitude.toFixed(6)}, ${c.longitude!.toFixed(6)}` : "—"}</dd></div>
              <div><dt className="text-gray-500">Plano de fusão</dt><dd>{c.capacidade_fibras} FO → {c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(", ") || "—"}</dd></div>
              <div><dt className="text-gray-500">Grupos</dt><dd>{c.grupos_fusionados} fusionados · {c.grupos_vagos} vagos · {plano.param} param aqui</dd></div>
            </dl>
            {c.manobras.length > 0 && (
              <table className="mt-3 w-full break-inside-avoid">
                <thead className="text-left text-xs text-gray-500"><tr><th>Manobra · fibra de entrada</th><th>Ligada a</th><th>Motivo</th></tr></thead>
                <tbody>
                  {c.manobras.map((m) => (
                    <tr key={m.fibra_entrada} className="border-b border-gray-100">
                      <td className="py-1">{descreverFibra(m.fibra_entrada, c.capacidade_fibras)}</td>
                      <td className="py-1">Saída {m.saida}: {descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras)}</td>
                      <td className="py-1">{m.motivo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(c.fibras ?? []).length > 0 && (
              <table className="mt-3 w-full break-inside-avoid">
                <thead className="text-left text-xs text-gray-500">
                  <tr><th>Fibra</th><th>Cliente</th>{ponta && <><th>Sinal dBm</th><th>Reflexão dB</th><th>Perda dB/km</th></>}<th>Situação</th></tr>
                </thead>
                <tbody>
                  {c.fibras!.map((f) => (
                    <tr key={f.fibra} className="border-b border-gray-100">
                      <td className="py-1">{descreverFibra(f.fibra, c.capacidade_fibras)}</td>
                      <td className="py-1">{f.cliente ?? "—"}</td>
                      {ponta && <><td>{f.potencia_dbm ?? "—"}</td><td>{f.reflexao_db ?? "—"}</td><td>{f.perda_db_km ?? "—"}</td></>}
                      <td className="py-1">{f.sem_potencia ? <b className="text-red-700">SEM POTÊNCIA</b> : "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.saidas.length > 0 && (
              <div className="mt-3" dangerouslySetInnerHTML={{ __html: svgMapaFusao({ ...c, origem: origem(c) }) }} />
            )}
            {separarBandejas(c).length > 0 && (
              <table className="mt-3 w-full break-inside-avoid">
                <thead className="text-left text-xs text-gray-500"><tr><th>Bandeja</th><th>Fusões</th><th>Fibras de entrada</th><th>Foto</th></tr></thead>
                <tbody>
                  {separarBandejas(c).map((b) => (
                    <tr key={b.numero} className="border-b border-gray-100">
                      <td className="py-1">Bandeja {b.numero}</td><td>{b.ligacoes.length}</td><td>{faixasDaBandeja(b)}</td>
                      <td>{daCaixa.some((f) => f.tipo === "foto_bandeja" && f.bandeja === b.numero) ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {daCaixa.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {daCaixa.map((f, i) => (
                  <figure key={i} className="break-inside-avoid">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.url ? <img src={f.url} alt="" className="aspect-[4/3] w-full rounded border border-gray-200 object-cover" /> : null}
                    <figcaption className="mt-0.5 text-xs text-gray-500">
                      {f.tipo === "foto_otdr" ? `OTDR · fibra ${f.fibra}` : f.tipo === "foto_bandeja" ? `Bandeja ${f.bandeja}` : "Caixa"} · {quando(f.tirada_em)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="mt-6">
        <h2 className={titulo}>Registro fotográfico ({fotosOs.length})</h2>
        {fotosOs.length === 0 ? (
          <p className="mt-2 text-gray-500">Sem fotos.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-3">
            {fotosOs.map((f, i) => (
              <figure key={i} className="break-inside-avoid">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.url ? <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full rounded border border-gray-200 object-cover" /> : null}
                <figcaption className="mt-0.5 text-xs text-gray-500">Foto {i + 1} · {quando(f.tirada_em)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {assinatura?.url && (
        <section className={secao}>
          <h2 className={titulo}>Assinatura do responsável</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assinatura.url} alt="Assinatura" className="mt-2 h-28 border-b border-gray-400" />
          <p className="mt-1">{assinatura.descricao} · {quando(assinatura.tirada_em)}</p>
        </section>
      )}

      <footer className="mt-8 border-t border-gray-300 pt-2 text-xs text-gray-500">
        Multivale Engenharia · Backbone · documento gerado pelo Técnico Plus
      </footer>
    </main>
  );
}

export default function PaginaRelatorio() {
  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <Suspense fallback={<p className="p-10 text-center text-gray-500">Carregando relatório...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}
