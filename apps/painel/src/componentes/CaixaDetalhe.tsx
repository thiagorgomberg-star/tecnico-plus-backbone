"use client";

import { useEffect, useState } from "react";

import { CaixaRede, calcularPlano, descreverOlt, localDgo, padroesPorExtenso, ehPonta, descreverFibra, faixasDaBandeja, rotuloInstalacao, rotuloPonto, separarBandejas, svgMapaFusao } from "@/lib/fusao";
import { supabase } from "@/lib/supabase";

export type CaixaPainel = CaixaRede & {
  tipo: string;
  os_id: string;
  os_numero: number;
  trecho: string | null;
  tecnico: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  localizada_em: string | null;
  grupos_fusionados: number;
  grupos_vagos: number;
  observacao: string | null;
  origem_identificacao: string | null;
  parceiro?: string | null;
  instalacao?: string | null;
  bastidor?: string | null;
  fila?: string | null;
  rack?: string | null;
};

type Foto = { id: string; tipo: string; fibra: number | null; bandeja: number | null; url?: string };

export { ehPonta };
export const origemDe = (c: CaixaPainel) => c.origem_identificacao ?? (c.origem_dgo ? `DGO ${c.origem_dgo}` : null);

// Dados completos de uma caixa: plano, manobras, fibras (cliente / OTDR nas pontas), mapa de fusão e fotos.
export default function CaixaDetalhe({ caixa: c }: { caixa: CaixaPainel }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const ponta = ehPonta(c.tipo);
  const dgo = c.tipo === "dgo";
  const plano = calcularPlano({ ...c, origem: origemDe(c) });

  useEffect(() => {
    supabase.from("os_anexos").select("id, tipo, fibra, bandeja, caminho_arquivo").eq("caixa_id", c.id).order("criado_em")
      .then(async ({ data }) => {
        const lista = data ?? [];
        if (!lista.length) return setFotos([]);
        const { data: urls } = await supabase.storage.from("os-anexos").createSignedUrls(lista.map((a) => a.caminho_arquivo), 3600);
        setFotos(lista.map((a, i) => ({ ...a, url: urls?.[i]?.signedUrl ?? undefined })));
      });
  }, [c.id]);

  return (
    <div className="text-sm">
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <div><dt className="text-gray-500">Tipo</dt><dd>{rotuloPonto(c.tipo)}{rotuloInstalacao(c.instalacao) ? ` · ${rotuloInstalacao(c.instalacao)}` : ""}{c.parceiro ? ` · ${c.parceiro}` : ""}</dd></div>
        <div><dt className="text-gray-500">Vem de</dt><dd>{origemDe(c) ?? "—"}{c.origem_saida ? ` (saída ${c.origem_saida})` : ""}</dd></div>
        <div>
          <dt className="text-gray-500">Localização</dt>
          <dd>{c.latitude != null ? (
            <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>
              {c.latitude.toFixed(6)}, {c.longitude!.toFixed(6)}
            </a>
          ) : "—"}</dd>
        </div>
        {padroesPorExtenso(c) ? <div className="sm:col-span-2"><dt className="text-gray-500">Padrão de cores</dt><dd>{padroesPorExtenso(c)}</dd></div> : null}
        {localDgo(c) ? <div><dt className="text-gray-500">Local do DGO</dt><dd>{localDgo(c)}</dd></div> : null}
        <div><dt className="text-gray-500">O.S. / técnico</dt><dd>#{c.os_numero} · {c.tecnico ?? "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-gray-500">Endereço</dt><dd>{c.endereco ?? "—"}</dd></div>
        <div>
          <dt className="text-gray-500">Plano de fusão</dt>
          <dd>{c.capacidade_fibras} FO → {c.saidas.length ? c.saidas.map((q, i) => `Saída ${i + 1}: ${q} FO`).join(", ") : "sem saída"}</dd>
        </div>
        <div><dt className="text-gray-500">Grupos</dt><dd>{c.grupos_fusionados} fusionados · {c.grupos_vagos} vagos · {plano.param} fibras param aqui</dd></div>
        {c.observacao && <div className="sm:col-span-2"><dt className="text-gray-500">Observação</dt><dd>{c.observacao}</dd></div>}
      </dl>

      {c.manobras.length > 0 && (
        <>
          <h4 className="mt-4 font-semibold">Manobras ({c.manobras.length})</h4>
          <table className="mt-1 w-full">
            <thead className="text-left text-xs text-gray-500"><tr><th>Fibra de entrada</th><th>Ligada a</th><th>Motivo</th></tr></thead>
            <tbody>
              {c.manobras.map((m) => (
                <tr key={m.fibra_entrada} className="border-t border-gray-100">
                  <td className="py-1">{descreverFibra(m.fibra_entrada, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)}</td>
                  <td className="py-1">Saída {m.saida}: {descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras, c.padrao_cores_saidas?.[m.saida - 1] ?? undefined)}</td>
                  <td className="py-1">{m.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(c.fibras ?? []).length > 0 && (
        <>
          <h4 className="mt-4 font-semibold">Fibras ({c.fibras!.length})</h4>
          <table className="mt-1 w-full">
            <thead className="text-left text-xs text-gray-500">
              <tr><th>Fibra</th><th>Cliente</th>{dgo && <><th>Posição DGO</th><th>OLT · SFP · cordão</th><th>TX / saída OLT dBm</th><th>RX dBm</th></>}{ponta && <><th>{dgo ? "" : "Sinal dBm"}</th><th>Reflexão dB</th><th>Perda dB/km</th><th>OTDR</th></>}<th>Situação</th></tr>
            </thead>
            <tbody>
              {c.fibras!.map((f) => {
                const otdr = fotos.filter((x) => x.tipo === "foto_otdr" && x.fibra === f.fibra);
                return (
                  <tr key={f.fibra} className="border-t border-gray-100">
                    <td className="py-1">{descreverFibra(f.fibra, c.capacidade_fibras, c.padrao_cores_entrada ?? undefined)}</td>
                    <td className="py-1">{f.cliente ?? "—"}</td>
                    {dgo && (
                      <>
                        <td className="py-1">{f.posicao_dgo ?? "—"}</td>
                        <td className="py-1">{f.cordao_olt ? descreverOlt(f) : "—"}</td>
                        <td className="py-1">{f.potencia_tx_dbm ?? "—"}</td>
                        <td className="py-1">{f.potencia_rx_dbm ?? "—"}</td>
                      </>
                    )}
                    {ponta && (
                      <>
                        <td className="py-1">{dgo ? "" : f.potencia_dbm ?? "—"}</td>
                        <td className="py-1">{f.reflexao_db ?? "—"}</td>
                        <td className="py-1">{f.perda_db_km ?? "—"}</td>
                        <td className="py-1">
                          {otdr.length ? otdr.map((o, i) => (
                            <a key={o.id} className="mr-1 text-blue-700 hover:underline" href={o.url} target="_blank" rel="noreferrer">foto{otdr.length > 1 ? ` ${i + 1}` : ""}</a>
                          )) : f.sem_potencia ? "—" : <span className="text-red-700">falta</span>}
                        </td>
                      </>
                    )}
                    <td className="py-1">{f.sem_potencia ? <b className="text-red-700">SEM POTÊNCIA</b> : "OK"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {c.saidas.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2"
          dangerouslySetInnerHTML={{ __html: svgMapaFusao({ ...c, origem: origemDe(c) }) }} />
      )}

      {separarBandejas(c).length > 0 && (
        <>
          <h4 className="mt-4 font-semibold">Bandejas ({c.fusoes_por_bandeja ?? 12} fusões por bandeja)</h4>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {separarBandejas(c).map((b) => {
              const foto = [...fotos].reverse().find((f) => f.tipo === "foto_bandeja" && f.bandeja === b.numero);
              return (
                <figure key={b.numero} className="rounded-lg border border-gray-200 p-2">
                  {foto?.url ? (
                    <a href={foto.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.url} alt={`Bandeja ${b.numero}`} className="aspect-[4/3] w-full rounded object-cover" />
                    </a>
                  ) : <div className="flex aspect-[4/3] items-center justify-center rounded bg-red-50 text-xs font-medium text-red-700">sem foto da bandeja</div>}
                  <figcaption className="mt-1 text-xs"><b>Bandeja {b.numero}</b> · {b.ligacoes.length} fusões · {faixasDaBandeja(b)}</figcaption>
                </figure>
              );
            })}
          </div>
        </>
      )}

      {fotos.filter((f) => f.tipo === "foto_caixa" || f.tipo === "foto_olt").length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.filter((f) => f.tipo === "foto_caixa" || f.tipo === "foto_olt").map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.tipo === "foto_olt" ? "OLT e cordões" : dgo ? "DGO" : "Acomodação da caixa"} className="aspect-[4/3] w-full rounded border border-gray-200 object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
