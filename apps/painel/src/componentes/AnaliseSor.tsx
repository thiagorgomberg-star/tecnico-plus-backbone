"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { pdfDoElemento } from "@/lib/pdfDoElemento";
import { analisarSor, km, lerSor, Nivel, Sor } from "@/lib/sor";
import { supabase } from "@/lib/supabase";

const COR: Record<Nivel, string> = { ok: "#1E9E4A", atencao: "#D99A00", critico: "#D0453B" };
const ROTULO: Record<Nivel, string> = { ok: "OK", atencao: "Atenção", critico: "Crítico" };

// Análise de um arquivo .SOR do OTDR: resumo da fibra, traço com os eventos marcados e o que fazer em cada evento.
// A curva vem do armazenamento (bucket + caminho) ou de um arquivo escolhido no computador (arquivo).
export default function AnaliseSor({ bucket, caminho, arquivo, nome, extensaoKm, fechar, aoAnalisar }: {
  bucket?: string; caminho?: string; arquivo?: File; nome: string; extensaoKm: number | null; fechar: () => void;
  aoAnalisar?: (resumo: { comprimentoKm: number; perdaTotalDb: number; criticos: number; atencao: number }) => void;
}) {
  const [sor, setSor] = useState<Sor | null>(null);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      let dados: Blob | null = arquivo ?? null;
      if (!dados && bucket && caminho) dados = (await supabase.storage.from(bucket).download(caminho)).data;
      if (!dados) return setErro("Não foi possível baixar o arquivo.");
      try {
        setSor(lerSor(new Uint8Array(await dados.arrayBuffer())));
      } catch (e) {
        const msg = (e as Error).message || "";
        setErro(/DataView|bounds|bytes/i.test(msg) ? "Não foi possível ler esta curva: o arquivo parece incompleto ou num formato .SOR ainda não reconhecido." : msg || "Arquivo .SOR inválido.");
      }
    })();
  }, [bucket, caminho, arquivo]);

  const analise = useMemo(() => (sor ? analisarSor(sor, extensaoKm) : null), [sor, extensaoKm]);
  useEffect(() => {
    if (analise) aoAnalisar?.({ comprimentoKm: analise.comprimentoKm, perdaTotalDb: analise.perdaTotalDb, criticos: analise.criticos, atencao: analise.atencao });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise]);

  // PDF com o mesmo nome do .SOR: compartilha (WhatsApp, e-mail...) pelo menu do sistema ou baixa, se o navegador não compartilhar arquivo.
  const conteudo = useRef<HTMLDivElement>(null);
  const [gerando, setGerando] = useState(false);
  const nomePdf = `${nome.replace(/\.sor$/i, "").replace(/[\\/:*?"<>|]/g, "_") || "analise-curva"}.pdf`;
  async function pdf(compartilhar: boolean) {
    if (!conteudo.current || gerando) return;
    setGerando(true);
    try {
      const arquivoPdf = new File([await pdfDoElemento(conteudo.current)], nomePdf, { type: "application/pdf" });
      if (compartilhar && navigator.canShare?.({ files: [arquivoPdf] })) {
        try { await navigator.share({ files: [arquivoPdf], title: nomePdf }); } catch (e) { if ((e as Error).name !== "AbortError") throw e; }
      } else {
        const url = URL.createObjectURL(arquivoPdf);
        const a = Object.assign(document.createElement("a"), { href: url, download: nomePdf });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        if (compartilhar) alert(`Este navegador não abre o menu de compartilhar. O PDF foi baixado como "${nomePdf}" para você anexar.`);
      }
    } catch (e) {
      alert(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  }
  function imprimir() {
    const titulo = document.title;
    document.title = nomePdf.replace(/\.pdf$/, "");
    window.print();
    document.title = titulo;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 p-4">
          <div className="flex-1">
            <h2 className="font-semibold">Análise da curva OTDR</h2>
            <p className="text-xs text-gray-500">{nome}</p>
          </div>
          <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" disabled={!analise || gerando} onClick={() => pdf(true)}>
            {gerando ? "Gerando PDF..." : "Compartilhar PDF"}
          </button>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50" disabled={!analise || gerando} onClick={() => pdf(false)}>Baixar PDF</button>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={imprimir}>Imprimir</button>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={fechar}>Fechar</button>
        </div>

        {erro ? <p className="p-6 text-red-700">{erro}</p> : !sor || !analise ? <p className="p-6 text-gray-500">Lendo o arquivo...</p> : (
          <div ref={conteudo} className="grid gap-4 bg-white p-4 text-sm">
            <div>
              <div className="text-base font-semibold">Análise da curva OTDR · {nome}</div>
              <div className="text-xs text-gray-500">Técnico Plus · Multivale Backbone · gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Indicador rotulo="Comprimento da fibra" valor={km(analise.comprimentoKm)}
                alerta={!!extensaoKm && analise.comprimentoKm < extensaoKm * 0.97} extra={extensaoKm ? `trecho: ${km(extensaoKm)}` : undefined} />
              <Indicador rotulo="Perda total" valor={`${fmt(analise.perdaTotalDb)} dB`} />
              <Indicador rotulo="Atenuação média" valor={analise.atenuacaoMediaDbKm != null ? `${fmt(analise.atenuacaoMediaDbKm, 3)} dB/km` : "—"} />
              <Indicador rotulo="ORL" valor={sor.orlDb ? `${fmt(sor.orlDb)} dB` : "—"} />
              <Indicador rotulo="Eventos" valor={`${sor.eventos.length}`}
                extra={`${analise.criticos} crítico(s) · ${analise.atencao} atenção`} alerta={analise.criticos > 0} />
            </div>

            <p className="text-xs text-gray-500">
              {[sor.fabricante, sor.equipamento].filter(Boolean).join(" ")} · {sor.comprimentoOndaNm} nm · pulso {sor.pulsoNs} ns ·
              IOR {sor.indiceRefracao.toFixed(4)} · resolução {fmt(sor.resolucaoM)} m
              {sor.cabo ? ` · cabo ${sor.cabo}` : ""}{sor.fibra ? ` · fibra ${sor.fibra}` : ""}
              {sor.localA || sor.localB ? ` · ${sor.localA || "?"} → ${sor.localB || "?"}` : ""}
              {sor.data ? ` · medida em ${sor.data.toLocaleString("pt-BR")}` : ""}
            </p>

            {sor.traco.length ? <Traco sor={sor} niveis={analise.diagnosticos.map((d) => d.nivel)} selecionado={selecionado} selecionar={setSelecionado} /> : null}

            <table className="w-full text-left">
              <thead className="border-b border-gray-200 text-xs text-gray-500">
                <tr><th className="p-2">#</th><th>Distância</th><th>Tipo</th><th>Perda</th><th>Reflectância</th><th>Lance</th><th>Situação</th><th>O que fazer</th></tr>
              </thead>
              <tbody>
                {analise.diagnosticos.map((d, i) => (
                  <tr key={i} className={`cursor-pointer border-b border-gray-100 align-top ${selecionado === i ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    onClick={() => setSelecionado(i)}>
                    <td className="p-2 font-mono">{d.evento.numero}</td>
                    <td className="whitespace-nowrap py-2 font-semibold">{km(d.evento.distanciaKm)}</td>
                    <td className="py-2">{d.tipo}</td>
                    <td className="whitespace-nowrap py-2">{fmt(d.evento.perdaDb, 3)} dB</td>
                    <td className="whitespace-nowrap py-2">{d.evento.reflectanciaDb ? `${fmt(d.evento.reflectanciaDb)} dB` : "—"}</td>
                    <td className="whitespace-nowrap py-2">{d.evento.inclinacaoDbKm ? `${fmt(d.evento.inclinacaoDbKm, 3)} dB/km` : "—"}</td>
                    <td className="py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${COR[d.nivel]}1F`, color: COR[d.nivel] }}>{ROTULO[d.nivel]}</span>
                    </td>
                    <td className="py-2 text-gray-700">{d.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">
              Limites usados: fusão até 0,30 dB, perda sem reflexão acima de 0,50 dB é crítica, conector até 0,75 dB, reflexão acima de -35 dB,
              lance acima de {sor.comprimentoOndaNm >= 1500 ? "0,30" : "0,45"} dB/km. A distância é a da fibra (inclui sobras), não a do mapa.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, extra, alerta }: { rotulo: string; valor: string; extra?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${alerta ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
      <div className="text-xs text-gray-500">{rotulo}</div>
      <div className={`text-lg font-bold ${alerta ? "text-red-700" : ""}`}>{valor}</div>
      {extra ? <div className="text-xs text-gray-500">{extra}</div> : null}
    </div>
  );
}

function Traco({ sor, niveis, selecionado, selecionar }: { sor: Sor; niveis: Nivel[]; selecionado: number | null; selecionar: (i: number) => void }) {
  const L = 960, A = 300, m = { e: 44, d: 12, t: 12, b: 28 };
  const maxKm = Math.max(...sor.traco.map((p) => p.km), ...sor.eventos.map((e) => e.distanciaKm)) || 1;
  const dbs = sor.traco.map((p) => p.db);
  const maxDb = Math.max(...dbs), minDb = Math.min(...dbs);
  const x = (k: number) => m.e + (k / maxKm) * (L - m.e - m.d);
  const y = (d: number) => m.t + ((maxDb - d) / (maxDb - minDb || 1)) * (A - m.t - m.b);
  const caminho = sor.traco.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join("");
  const passoKm = [0.5, 1, 2, 5, 10, 20, 50].find((v) => maxKm / v <= 10) ?? 100;
  const passoDb = [1, 2, 5, 10, 20].find((v) => (maxDb - minDb) / v <= 6) ?? 50;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC]">
      {Array.from({ length: Math.floor(maxKm / passoKm) + 1 }, (_, i) => i * passoKm).map((k) => (
        <g key={`x${k}`}>
          <line x1={x(k)} x2={x(k)} y1={m.t} y2={A - m.b} stroke="#E4E7EC" />
          <text x={x(k)} y={A - 10} fontSize="11" fill="#667085" textAnchor="middle">{k} km</text>
        </g>
      ))}
      {Array.from({ length: Math.floor((maxDb - minDb) / passoDb) + 1 }, (_, i) => Math.ceil(minDb / passoDb) * passoDb + i * passoDb).map((d) => (
        <g key={`y${d}`}>
          <line x1={m.e} x2={L - m.d} y1={y(d)} y2={y(d)} stroke="#E4E7EC" />
          <text x={m.e - 6} y={y(d) + 4} fontSize="11" fill="#667085" textAnchor="end">{d} dB</text>
        </g>
      ))}
      <path d={caminho} fill="none" stroke="#163A6B" strokeWidth="1.5" />
      {sor.eventos.map((e, i) => (
        <g key={i} onClick={() => selecionar(i)} style={{ cursor: "pointer" }}>
          <line x1={x(e.distanciaKm)} x2={x(e.distanciaKm)} y1={m.t} y2={A - m.b} stroke={COR[niveis[i]]} strokeWidth={selecionado === i ? 3 : 1.5}
            strokeDasharray={selecionado === i ? undefined : "4 3"} />
          <circle cx={x(e.distanciaKm)} cy={m.t + 10} r="9" fill={COR[niveis[i]]} />
          <text x={x(e.distanciaKm)} y={m.t + 14} fontSize="11" fontWeight="bold" fill="#fff" textAnchor="middle">{e.numero}</text>
        </g>
      ))}
    </svg>
  );
}

const fmt = (n: number, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
