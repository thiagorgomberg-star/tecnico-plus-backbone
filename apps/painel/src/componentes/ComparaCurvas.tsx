"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Comparacao, compararAntesDepois, compararBidirecional, compararFibras, fimDaFibra, Momento, ROTULO_MOMENTO, ROTULO_SENTIDO, Sentido, tracoParaComparar,
} from "@/lib/comparaSor";
import { pdfDoElemento } from "@/lib/pdfDoElemento";
import { curvaCompleta, km, lerSor, Nivel, Sor } from "@/lib/sor";
import { supabase } from "@/lib/supabase";

export type CurvaParaComparar = {
  chave: string; nome: string; bucket?: string; caminho?: string; arquivo?: File; salvaId?: string;
  fibra: string; sentido: Sentido | ""; momento: Momento;
};
type Tipo = "bidirecional" | "antesDepois" | "fibras";

const COR: Record<Nivel, string> = { ok: "#1E9E4A", atencao: "#D99A00", critico: "#D0453B" };
const CORES_CURVA = ["#163A6B", "#E07B00"]; // curva 1 (A→B / antes) e curva 2 (B→A / depois)
const fmt = (n: number | null, casas = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));

// Comparativo de duas curvas: A→B × B→A (média bidirecional), antes × depois no mesmo sentido, ou duas fibras
// do mesmo cabo no mesmo sentido (pontos de atenuação comuns = esforço no cabo ou caixa mal acomodada).
// Cada curva é marcada com a fibra, o sentido e o momento, e a lista pode ser filtrada pela fibra.
export default function ComparaCurvas({ curvas, aoMudar, analisarSozinha, fechar }: {
  curvas: CurvaParaComparar[];
  aoMudar: (chave: string, mudanca: Partial<Pick<CurvaParaComparar, "fibra" | "sentido" | "momento">>) => void;
  analisarSozinha: (c: CurvaParaComparar) => void;
  fechar: () => void;
}) {
  const [lidas, setLidas] = useState<Record<string, Sor | string>>({});
  const [modo, setModo] = useState<"completa" | "otdr">("completa");
  const [fibra, setFibra] = useState("");
  const [tipo, setTipo] = useState<Tipo>("bidirecional");
  const [c1, setC1] = useState("");
  const [c2, setC2] = useState("");

  useEffect(() => {
    curvas.forEach(async (c) => {
      if (lidas[c.chave]) return;
      let dados: Blob | null = c.arquivo ?? null;
      if (!dados && c.bucket && c.caminho) dados = (await supabase.storage.from(c.bucket).download(c.caminho)).data;
      let r: Sor | string;
      try { r = dados ? lerSor(new Uint8Array(await dados.arrayBuffer())) : "Não foi possível baixar."; } catch { r = "Arquivo .SOR inválido."; }
      setLidas((l) => ({ ...l, [c.chave]: r }));
      // A fibra gravada no próprio .SOR já vem preenchida.
      if (typeof r !== "string" && !c.fibra && r.fibra) aoMudar(c.chave, { fibra: r.fibra });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curvas.map((c) => c.chave).join()]);

  const fibras = [...new Set(curvas.map((c) => c.fibra.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  // Duas fibras: o filtro não se aplica (são fibras diferentes de propósito).
  const visiveis = curvas.filter((c) => tipo === "fibras" || !fibra || c.fibra.trim() === fibra);
  const sor = (chave: string) => { const s = lidas[chave]; return s && typeof s !== "string" ? (modo === "completa" ? curvaCompleta(s) : s) : null; };

  // Sugere o par conforme o tipo: A→B com B→A, ou antes com depois no mesmo sentido.
  useEffect(() => {
    const ok = (c: CurvaParaComparar) => typeof lidas[c.chave] === "object";
    const v = visiveis.filter(ok);
    if (tipo === "bidirecional") {
      setC1(v.find((c) => c.sentido === "AB")?.chave ?? v[0]?.chave ?? "");
      setC2(v.find((c) => c.sentido === "BA")?.chave ?? v[1]?.chave ?? "");
    } else if (tipo === "fibras") {
      const a = v[0];
      setC1(a?.chave ?? "");
      setC2((v.find((c) => c.chave !== a?.chave && c.fibra.trim() !== a?.fibra.trim() && (!a?.sentido || !c.sentido || c.sentido === a.sentido))
        ?? v.find((c) => c.chave !== a?.chave))?.chave ?? "");
    } else {
      const antes = v.find((c) => c.momento === "antes") ?? v[0];
      setC1(antes?.chave ?? "");
      setC2(v.find((c) => c.momento === "depois" && c.chave !== antes?.chave && (!antes?.sentido || c.sentido === antes.sentido))?.chave
        ?? v.find((c) => c.chave !== antes?.chave)?.chave ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, fibra, Object.keys(lidas).length, curvas.map((c) => `${c.chave}${c.sentido}${c.momento}`).join()]);

  const s1 = c1 ? sor(c1) : null, s2 = c2 && c2 !== c1 ? sor(c2) : null;
  const curva = (k: string) => curvas.find((c) => c.chave === k);
  const nomeFibra = (k: string, n: number) => `Fibra ${curva(k)?.fibra.trim() || n}`;
  const nomes: [string, string] = tipo === "bidirecional" ? ["A → B", "B → A"] : tipo === "fibras"
    ? (() => { const a = nomeFibra(c1, 1), b = nomeFibra(c2, 2); return a === b ? ["Fibra 1", "Fibra 2"] : [a, b]; })() : ["Antes", "Depois"];
  const comp: Comparacao | null = useMemo(
    () => (s1 && s2 ? (tipo === "bidirecional" ? compararBidirecional(s1, s2) : tipo === "fibras" ? compararFibras(s1, s2, nomes) : compararAntesDepois(s1, s2)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c1, c2, tipo, modo, lidas[c1], lidas[c2]],
  );
  const sentidoErrado = tipo === "bidirecional" && c1 && c2 && curva(c1)?.sentido && curva(c2)?.sentido && curva(c1)!.sentido === curva(c2)!.sentido;
  const sentidoDiferente = tipo !== "bidirecional" && c1 && c2 && curva(c1)?.sentido && curva(c2)?.sentido && curva(c1)!.sentido !== curva(c2)!.sentido;
  const mesmaFibra = tipo === "fibras" && c1 && c2 && curva(c1)?.fibra && curva(c1)!.fibra.trim() === curva(c2)?.fibra.trim();
  const fibraDiferente = tipo !== "fibras" && c1 && c2 && curva(c1)?.fibra && curva(c2)?.fibra && curva(c1)!.fibra.trim() !== curva(c2)!.fibra.trim();

  const conteudo = useRef<HTMLDivElement>(null);
  const [gerando, setGerando] = useState(false);
  let analista: { nome?: string; cargo?: string; empresa?: string; registro?: string } = {};
  try { analista = JSON.parse(localStorage.getItem("analista-curva") || "{}"); } catch { /* opcional */ }
  async function baixarPdf() {
    if (!conteudo.current) return;
    setGerando(true);
    try {
      const blob = await pdfDoElemento(conteudo.current);
      const nome = `comparativo-${fibra ? `fibra-${fibra}-` : ""}${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: nome }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { alert(`Não foi possível gerar o PDF: ${(e as Error).message}`); } finally { setGerando(false); }
  }

  const campo = "rounded-lg border border-gray-300 px-2 py-1 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-6xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
          <div className="flex-1">
            <h2 className="font-semibold">Comparar curvas OTDR</h2>
            <p className="text-xs text-gray-500">Marque a fibra, o sentido e o momento de cada curva. O comparativo usa duas curvas da mesma fibra.</p>
          </div>
          <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" disabled={!comp || gerando} onClick={baixarPdf}>
            {gerando ? "Gerando PDF..." : "Baixar PDF"}
          </button>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={fechar}>Fechar</button>
        </div>

        <div className="grid gap-3 border-b border-gray-200 p-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr><th className="py-1">Curva</th><th>Fibra</th><th>Sentido</th><th>Momento</th><th>Comprimento</th><th /></tr>
            </thead>
            <tbody>
              {curvas.map((c) => {
                const s = lidas[c.chave];
                return (
                  <tr key={c.chave} className={`border-t border-gray-100 ${fibra && c.fibra.trim() !== fibra ? "opacity-40" : ""}`}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{c.nome}</div>
                      {typeof s === "string" ? <div className="text-xs text-red-700">{s}</div>
                        : s ? <div className="text-xs text-gray-500">{s.comprimentoOndaNm} nm · pulso {s.pulsoNs} ns{s.data ? ` · ${s.data.toLocaleDateString("pt-BR")}` : ""}</div>
                          : <div className="text-xs text-gray-400">lendo...</div>}
                    </td>
                    <td><input aria-label={`Fibra de ${c.nome}`} className={`${campo} w-20`} value={c.fibra} onChange={(e) => aoMudar(c.chave, { fibra: e.target.value })} /></td>
                    <td>
                      <select aria-label={`Sentido de ${c.nome}`} className={campo} value={c.sentido} onChange={(e) => aoMudar(c.chave, { sentido: e.target.value as Sentido | "" })}>
                        <option value="">—</option><option value="AB">{ROTULO_SENTIDO.AB}</option><option value="BA">{ROTULO_SENTIDO.BA}</option>
                      </select>
                    </td>
                    <td>
                      <select aria-label={`Momento de ${c.nome}`} className={campo} value={c.momento} onChange={(e) => aoMudar(c.chave, { momento: e.target.value as Momento })}>
                        <option value="">—</option><option value="antes">Antes</option><option value="depois">Depois</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap">{s && typeof s !== "string" ? km(fimDaFibra(s)) : "—"}</td>
                    <td className="text-right"><button className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => analisarSozinha(c)}>Analisar só esta</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-gray-600">Filtrar fibra</span>
              <select className={campo} value={fibra} disabled={tipo === "fibras"} onChange={(e) => setFibra(e.target.value)}>
                <option value="">Todas</option>
                {fibras.map((f) => <option key={f} value={f}>Fibra {f}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-gray-600">Comparação</span>
              <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
                <option value="bidirecional">A → B × B → A (bidirecional)</option>
                <option value="antesDepois">Antes × depois (mesmo sentido)</option>
                <option value="fibras">Duas fibras do mesmo cabo (mesmo sentido)</option>
              </select>
            </label>
            {[[c1, setC1], [c2, setC2]].map(([v, set], i) => (
              <label key={i} className="grid gap-1">
                <span className="text-xs font-medium" style={{ color: CORES_CURVA[i] }}>Curva {nomes[i]}</span>
                <select className={`${campo} max-w-64`} value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value)}>
                  <option value="">Escolha...</option>
                  {visiveis.map((c) => (
                    <option key={c.chave} value={c.chave}>
                      {c.nome}{c.fibra ? ` · F${c.fibra}` : ""}{c.sentido ? ` · ${ROTULO_SENTIDO[c.sentido]}` : ""}{c.momento ? ` · ${ROTULO_MOMENTO[c.momento]}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="grid gap-1">
              <span className="text-xs font-medium text-gray-600">Eventos analisados</span>
              <div className="flex gap-1">
                {([["otdr", "Somente do OTDR"], ["completa", "Curva toda"]] as const).map(([m, t]) => (
                  <button key={m} onClick={() => setModo(m)}
                    className={`rounded-lg border px-2 py-1 ${modo === m ? "border-[#163A6B] bg-[#163A6B] text-white" : "border-gray-300 hover:bg-gray-50"}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          {sentidoErrado ? <p className="text-sm text-amber-700">As duas curvas estão marcadas no mesmo sentido; para o bidirecional use uma A → B e uma B → A.</p> : null}
          {sentidoDiferente ? <p className="text-sm text-amber-700">As duas curvas estão marcadas em sentidos diferentes; aqui as duas precisam ser medidas do mesmo lado.</p> : null}
          {mesmaFibra ? <p className="text-sm text-amber-700">As duas curvas são da mesma fibra; escolha duas fibras diferentes do mesmo cabo.</p> : null}
          {fibraDiferente ? <p className="text-sm text-amber-700">As curvas escolhidas estão marcadas com fibras diferentes.</p> : null}
        </div>

        {!comp || !s1 || !s2 ? (
          <p className="p-6 text-sm text-gray-500">{curvas.length < 2 ? "Selecione pelo menos duas curvas para comparar." : "Escolha as duas curvas para ver o comparativo."}</p>
        ) : (
          <div ref={conteudo} className="grid gap-4 bg-white p-4 text-sm">
            <div>
              <div className="text-base font-semibold">
                Comparativo {tipo === "bidirecional" ? "bidirecional (A → B × B → A)" : tipo === "fibras" ? `de duas fibras do mesmo cabo (${nomes[0]} × ${nomes[1]})` : "antes × depois"}{tipo !== "fibras" && (fibra || curva(c1)?.fibra) ? ` · fibra ${fibra || curva(c1)?.fibra}` : ""}
              </div>
              <div className="text-xs text-gray-500">
                <span style={{ color: CORES_CURVA[0] }}>■</span> {nomes[0]}: {curva(c1)?.nome} · <span style={{ color: CORES_CURVA[1] }}>■</span> {nomes[1]}: {curva(c2)?.nome}
                {" "}· {modo === "completa" ? "curva lida por inteiro" : "somente eventos do OTDR"} · gerado em {new Date().toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Indicador rotulo={`Comprimento ${nomes[0]}`} valor={km(comp.comprimento1Km)} />
              <Indicador rotulo={`Comprimento ${nomes[1]}`} valor={km(comp.comprimento2Km)} alerta={comp.avisos.some((a) => a.nivel === "critico")} />
              <Indicador rotulo={`Perda total ${nomes[0]}`} valor={`${fmt(comp.perdaTotal1Db)} dB`} />
              <Indicador rotulo={`Perda total ${nomes[1]}`} valor={`${fmt(comp.perdaTotal2Db)} dB`}
                extra={tipo === "fibras" ? `diferença ${fmt(Math.abs(comp.perdaTotal2Db - comp.perdaTotal1Db))} dB` : tipo === "bidirecional" ? `média ${fmt((comp.perdaTotal1Db + comp.perdaTotal2Db) / 2)} dB` : `diferença ${fmt(comp.perdaTotal2Db - comp.perdaTotal1Db)} dB`} />
              <Indicador rotulo="Eventos" valor={`${comp.linhas.length}`} extra={`${comp.criticos} crítico(s) · ${comp.atencao} atenção`} alerta={comp.criticos > 0} />
            </div>
            {comp.avisos.map((a, i) => (
              <p key={i} className="rounded-lg px-3 py-2" style={{ background: `${COR[a.nivel]}14`, color: a.nivel === "ok" ? "#14532d" : COR[a.nivel] }}>{a.texto}</p>
            ))}
            <Sobreposto s1={s1} s2={s2} espelhar={tipo === "bidirecional"} nomes={nomes} linhas={comp} />
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="p-2">#</th><th>Distância (de A)</th><th>{nomes[0]}</th><th>{nomes[1]}</th>
                  <th>{tipo === "bidirecional" ? "Média (perda real)" : tipo === "fibras" ? "Perda comum" : "Diferença"}</th><th>Situação</th><th>O que fazer</th>
                </tr>
              </thead>
              <tbody>
                {comp.linhas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-100 align-top">
                    <td className="p-2 font-mono">{i + 1}</td>
                    <td className="whitespace-nowrap py-2 font-semibold">{km(l.km)}{l.reflexivo ? <div className="text-[10px] font-normal text-gray-500">reflexivo</div> : null}</td>
                    <td className="whitespace-nowrap py-2">{l.perda1 == null ? "—" : `${fmt(l.perda1, 3)} dB`}</td>
                    <td className="whitespace-nowrap py-2">{l.perda2 == null ? "—" : `${fmt(l.perda2, 3)} dB`}</td>
                    <td className="whitespace-nowrap py-2 font-semibold">{l.resultado == null ? "—" : `${tipo === "antesDepois" && l.resultado > 0 ? "+" : ""}${fmt(l.resultado, 3)} dB`}</td>
                    <td className="py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${COR[l.nivel]}1F`, color: COR[l.nivel] }}>{l.situacao}</span>
                    </td>
                    <td className="py-2 text-gray-700">{l.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">
              {tipo === "bidirecional"
                ? "A perda real de cada emenda é a média dos dois sentidos. As distâncias do B → A foram espelhadas para ficarem contadas a partir de A."
                : tipo === "fibras" ? "Perda comum = a menor perda das duas fibras no mesmo ponto. Acima de 0,15 dB nas duas é sinal de esforço no cabo (torção, esmagamento, curvatura, ferragem apertada) ou acomodação ruim na caixa; perda alta só numa fibra é fusão/acomodação daquela fibra. Para confirmar a perda real, meça também no outro sentido."
                : "Diferença = perda depois − perda antes. Piorou acima de 0,10 dB; acima de 0,30 dB é crítico."}
              {tipo === "bidirecional" ? " Limites da média: fusão até 0,30 dB, acima de 0,50 dB sem reflexão é crítico, conector até 0,75 dB." : ""}
            </p>
            {analista.nome ? (
              <div className="flex flex-wrap items-end gap-6 border-t border-gray-200 pt-3">
                {([["Analista", analista.nome], ["Cargo / função", analista.cargo], ["Empresa", analista.empresa], ["Registro", analista.registro]] as const)
                  .filter(([, v]) => v).map(([r, v]) => <div key={r}><div className="text-xs text-gray-500">{r}</div><div className="font-semibold">{v}</div></div>)}
                <div className="ml-auto w-56 border-t border-gray-700 pt-1 text-center text-xs">Assinatura</div>
              </div>
            ) : null}
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

// As duas curvas no mesmo gráfico, com os eventos comparados marcados pela situação.
function Sobreposto({ s1, s2, espelhar, nomes, linhas }: { s1: Sor; s2: Sor; espelhar: boolean; nomes: string[]; linhas: Comparacao }) {
  const L = 960, A = 300, m = { e: 48, d: 12, t: 22, b: 28 };
  const t1 = tracoParaComparar(s1);
  const t2 = tracoParaComparar(s2, espelhar ? { comprimentoKm: fimDaFibra(s1) } : undefined);
  const todos = [...t1, ...t2];
  if (!todos.length) return null;
  const maxKm = Math.max(...todos.map((p) => p.km)) || 1;
  const dbs = todos.map((p) => p.db).sort((a, b) => a - b);
  // Corta os picos extremos (reflexões e ruído do fim) para a escala não esmagar a curva.
  const minDb = dbs[Math.floor(dbs.length * 0.02)], maxDb = Math.max(1, dbs[Math.floor(dbs.length * 0.995)]);
  const x = (k: number) => m.e + (k / maxKm) * (L - m.e - m.d);
  const y = (d: number) => m.t + ((maxDb - Math.min(maxDb, Math.max(minDb, d))) / (maxDb - minDb || 1)) * (A - m.t - m.b);
  const caminho = (t: { km: number; db: number }[]) => t.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p.db).toFixed(1)}`).join("");
  const passoKm = [0.5, 1, 2, 5, 10, 20, 50].find((v) => maxKm / v <= 10) ?? 100;
  const passoDb = [1, 2, 5, 10, 20].find((v) => (maxDb - minDb) / v <= 6) ?? 50;
  return (
    <div>
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
        <path d={caminho(t1)} fill="none" stroke={CORES_CURVA[0]} strokeWidth="1.5" />
        <path d={caminho(t2)} fill="none" stroke={CORES_CURVA[1]} strokeWidth="1.5" />
        {linhas.linhas.map((l, i) => (
          <g key={i}>
            <line x1={x(l.km)} x2={x(l.km)} y1={m.t} y2={A - m.b} stroke={COR[l.nivel]} strokeWidth="1.2" strokeDasharray="4 3" />
            <circle cx={x(l.km)} cy={m.t - 8} r="8" fill={COR[l.nivel]} />
            <text x={x(l.km)} y={m.t - 4.5} fontSize="10" fontWeight="bold" fill="#fff" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-gray-600">
        <span><span style={{ color: CORES_CURVA[0] }}>━</span> {nomes[0]}</span>
        <span><span style={{ color: CORES_CURVA[1] }}>━</span> {nomes[1]}{espelhar ? " (espelhada: OTDR no lado B, à direita)" : ""}</span>
        <span>dB relativos ao início de cada medição</span>
      </div>
    </div>
  );
}
