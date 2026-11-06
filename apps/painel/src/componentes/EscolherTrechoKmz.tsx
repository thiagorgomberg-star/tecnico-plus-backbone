"use client";

import { useEffect, useMemo, useState } from "react";

import { fmtMetros } from "@/lib/fusao";
import { comprimento, lerKmz, prepararTracado, Tracado, TracadoSalvo } from "@/lib/tracado";

// KMZ geral (várias rotas): lista as linhas com as pastas e o comprimento para marcar só as do trecho.
// Com até 3 linhas já vem tudo marcado.
export default function EscolherTrechoKmz({ arquivo, fechar, aoEscolher }: {
  arquivo: File; fechar: () => void; aoEscolher: (t: TracadoSalvo, descricao: string) => void;
}) {
  const [kmz, setKmz] = useState<Tracado | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const t = await lerKmz(new Uint8Array(await arquivo.arrayBuffer()));
        if (!t.linhas.length) throw new Error("Não achei nenhuma linha de cabo (LineString) neste arquivo.");
        setKmz(t);
        if (t.linhas.length <= 3) setMarcadas(new Set(t.linhas.map((_, i) => i)));
      } catch (e) { setErro((e as Error).message); }
    })();
  }, [arquivo]);

  const linhas = useMemo(() => (kmz ? kmz.linhas.map((l, i) => ({ i, nome: kmz.nomesLinhas?.[i] ?? `Linha ${i + 1}`, metros: comprimento(l) })) : []), [kmz]);
  const termos = busca.toLowerCase().split(/\s+/).filter(Boolean);
  const visiveis = linhas.filter((l) => termos.every((t) => l.nome.toLowerCase().includes(t)));
  const total = linhas.filter((l) => marcadas.has(l.i)).reduce((s, l) => s + l.metros, 0);
  const alternar = (i: number) => setMarcadas((m) => { const n = new Set(m); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={fechar}>
      <div className="grid w-full max-w-3xl gap-3 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-semibold">Escolher o trecho no KMZ</h3>
          <p className="text-xs text-gray-500">{arquivo.name} · marque as linhas do cabo deste trecho (o KMZ pode ter a rede inteira).</p>
        </div>
        {erro ? <p className="text-sm text-red-700">{erro}</p> : !kmz ? <p className="text-sm text-gray-500">Lendo o KMZ...</p> : (
          <>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-gray-600">Buscar pelo nome ou pela pasta</span>
              <input className="rounded-lg border border-gray-300 px-3 py-2" placeholder="Ex.: pinhal campos" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50" onClick={() => setMarcadas((m) => new Set([...m, ...visiveis.map((l) => l.i)]))}>
                Marcar as {visiveis.length} da busca
              </button>
              <button className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50" onClick={() => setMarcadas(new Set())}>Desmarcar todas</button>
              <span className="ml-auto text-gray-600">{marcadas.size} linha(s) · {fmtMetros(total)}</span>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200">
              {visiveis.map((l) => (
                <li key={l.i} className="border-b border-gray-100 last:border-0">
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                    <input type="checkbox" checked={marcadas.has(l.i)} onChange={() => alternar(l.i)} />
                    <span className="flex-1">{l.nome}</span>
                    <span className="whitespace-nowrap text-xs text-gray-500">{fmtMetros(l.metros)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={fechar}>Cancelar</button>
          <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" disabled={!kmz || !marcadas.size}
            onClick={() => {
              const idx = [...marcadas].sort((a, b) => a - b);
              aoEscolher(prepararTracado(kmz!, idx), idx.map((i) => linhas[i].nome.split(" / ").pop()).slice(0, 3).join(", ") + (idx.length > 3 ? "…" : ""));
            }}>
            Usar estas linhas
          </button>
        </div>
      </div>
    </div>
  );
}
