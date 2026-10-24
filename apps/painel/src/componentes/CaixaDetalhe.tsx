"use client";

import { useEffect, useState } from "react";

import { CaixaRede, calcularPlano, descreverFibra, rotuloPonto, svgMapaFusao } from "@/lib/fusao";
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
};

type Foto = { id: string; tipo: string; fibra: number | null; url?: string };

export const ehPonta = (tipo: string) => tipo === "dgo" || tipo === "entroncamento";
export const origemDe = (c: CaixaPainel) => c.origem_identificacao ?? (c.origem_dgo ? `DGO ${c.origem_dgo}` : null);

// Dados completos de uma caixa: plano, manobras, fibras (cliente / OTDR nas pontas), mapa de fusão e fotos.
export default function CaixaDetalhe({ caixa: c }: { caixa: CaixaPainel }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const ponta = ehPonta(c.tipo);
  const plano = calcularPlano({ ...c, origem: origemDe(c) });

  useEffect(() => {
    supabase.from("os_anexos").select("id, tipo, fibra, caminho_arquivo").eq("caixa_id", c.id).order("criado_em")
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
        <div><dt className="text-gray-500">Tipo</dt><dd>{rotuloPonto(c.tipo)}</dd></div>
        <div><dt className="text-gray-500">Vem de</dt><dd>{origemDe(c) ?? "—"}{c.origem_saida ? ` (saída ${c.origem_saida})` : ""}</dd></div>
        <div>
          <dt className="text-gray-500">Localização</dt>
          <dd>{c.latitude != null ? (
            <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>
              {c.latitude.toFixed(6)}, {c.longitude!.toFixed(6)}
            </a>
          ) : "—"}</dd>
        </div>
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
                  <td className="py-1">{descreverFibra(m.fibra_entrada, c.capacidade_fibras)}</td>
                  <td className="py-1">Saída {m.saida}: {descreverFibra(m.fibra_saida, c.saidas[m.saida - 1] ?? c.capacidade_fibras)}</td>
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
              <tr><th>Fibra</th><th>Cliente</th>{ponta && <><th>Sinal dBm</th><th>Reflexão dB</th><th>Perda dB/km</th><th>OTDR</th></>}<th>Situação</th></tr>
            </thead>
            <tbody>
              {c.fibras!.map((f) => {
                const otdr = fotos.filter((x) => x.tipo === "foto_otdr" && x.fibra === f.fibra);
                return (
                  <tr key={f.fibra} className="border-t border-gray-100">
                    <td className="py-1">{descreverFibra(f.fibra, c.capacidade_fibras)}</td>
                    <td className="py-1">{f.cliente ?? "—"}</td>
                    {ponta && (
                      <>
                        <td className="py-1">{f.potencia_dbm ?? "—"}</td>
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

      {fotos.filter((f) => f.tipo === "foto_caixa").length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.filter((f) => f.tipo === "foto_caixa").map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="Foto da caixa" className="aspect-[4/3] w-full rounded border border-gray-200 object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
