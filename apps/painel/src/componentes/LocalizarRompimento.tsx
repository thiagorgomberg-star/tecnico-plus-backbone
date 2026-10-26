"use client";

import { useEffect, useMemo, useState } from "react";

import { CaixaPainel, origemDe } from "@/componentes/CaixaDetalhe";
import { supabase } from "@/lib/supabase";
import { MarcaNoCaminho, refinarPorMarcas, descreverRompimento, fmtMetros, kmlRompimento, lancesDoEnlace, localizarRompimento, rotuloPonto, sentidoPadrao } from "@/lib/fusao";
import { pertoDoLance, comprimento, kmlRompimentoTracado, lerKmz, prepararTracado, rompimentoNoTracado, TracadoSalvo, trechoEntre } from "@/lib/tracado";

type Rota = { id: string; trecho: string };
type Kmz = { id: string; nome_arquivo: string; extensao_m: number | null; criado_em: string };

const numero = (t: string) => {
  const v = Number(t.replace(",", "."));
  return t.trim() && Number.isFinite(v) ? v : null;
};

// Enlace pela metragem do cabo e simulação do local de rompimento pela distância medida no OTDR
// (medição feita num DGO, entroncamento ou caixa). Ferramenta à parte: usa o mapeamento e a metragem já lançados.
export default function LocalizarRompimento() {
  const [caixas, setCaixas] = useState<CaixaPainel[]>([]);
  useEffect(() => {
    supabase.from("caixas_mapa").select("*").then(({ data }) => setCaixas((data as unknown as CaixaPainel[]) ?? []));
  }, []);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [rotaId, setRotaId] = useState("");
  const [kmzs, setKmzs] = useState<Kmz[]>([]);
  const [kmzId, setKmzId] = useState("");
  const [tracado, setTracado] = useState<TracadoSalvo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [marcas, setMarcas] = useState<MarcaNoCaminho[]>([]);
  useEffect(() => {
    supabase.from("vistoria_pontos_mapa").select("identificacao, categoria, latitude, longitude, metragem_cabo, reserva_m")
      .not("metragem_cabo", "is", null).not("latitude", "is", null).limit(5000)
      .then(({ data }) => setMarcas((data ?? []).map((p) => ({ nome: p.identificacao || p.categoria || "Poste", lat: p.latitude, lng: p.longitude, marca: Number(p.metragem_cabo), reserva: p.reserva_m }))));
  }, []);
  useEffect(() => {
    supabase.from("rotas").select("id, trecho").eq("ativo", true).order("trecho").then(({ data }) => setRotas(data ?? []));
  }, []);
  const rota = rotas.find((x) => x.id === rotaId) ?? null;
  const carregarKmzs = (id: string) => supabase.from("rota_kmz").select("id, nome_arquivo, extensao_m, criado_em").eq("rota_id", id)
    .order("criado_em", { ascending: false }).then(({ data }) => setKmzs(data ?? []));
  useEffect(() => {
    setKmzs([]); setKmzId(""); setTracado(null); setMedicaoId("");
    if (rotaId) carregarKmzs(rotaId);
  }, [rotaId]);
  useEffect(() => {
    setTracado(null);
    if (kmzId) supabase.from("rota_kmz").select("tracado").eq("id", kmzId).single().then(({ data }) => setTracado((data?.tracado as TracadoSalvo) ?? null));
  }, [kmzId]);

  // Insere o KMZ atual da rota: lê o traçado aqui e guarda arquivo + traçado para o app e as próximas buscas.
  async function inserirKmz(arquivo: File) {
    if (!rotaId) return;
    setEnviando(true);
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const t = prepararTracado(await lerKmz(bytes));
      if (t.caminho.length < 2) throw new Error("Não achei a linha do cabo (LineString) neste arquivo.");
      const id = crypto.randomUUID();
      const caminho = `${rotaId}/${id}.${/\.kml$/i.test(arquivo.name) ? "kml" : "kmz"}`;
      const envio = await supabase.storage.from("kmz").upload(caminho, arquivo);
      const { error } = await supabase.from("rota_kmz").insert({ id, rota_id: rotaId, nome_arquivo: arquivo.name, caminho_arquivo: envio.error ? null : caminho, tracado: t, extensao_m: Math.round(comprimento(t.caminho)) });
      if (error) throw error;
      await carregarKmzs(rotaId);
      setKmzId(id);
    } catch (e) {
      alert(`Não foi possível ler o KMZ: ${(e as Error).message}`);
    } finally { setEnviando(false); }
  }

  const [medicaoId, setMedicaoId] = useState("");
  const [fibra, setFibra] = useState("1");
  const [km, setKm] = useState("");
  const [excesso, setExcesso] = useState("");
  const [sentido, setSentido] = useState<"frente" | "tras">("frente");

  const rede = useMemo(() => caixas.map((c) => ({ ...c, origem: origemDe(c) })), [caixas]);
  const medicao = rede.find((c) => c.id === medicaoId) ?? null;
  // Pontas primeiro: a medição costuma ser no DGO ou no entroncamento.
  const daRota = useMemo(() => rede.filter((c) => rota && c.trecho === rota.trecho), [rede, rota]);
  const opcoes = useMemo(() => [...(daRota.length ? daRota : rede)].sort((a, b) => Number(b.tipo === "dgo" || b.tipo === "entroncamento") - Number(a.tipo === "dgo" || a.tipo === "entroncamento")
    || a.identificacao.localeCompare(b.identificacao)), [daRota, rede]);

  const lances = useMemo(() => (medicao && numero(fibra) ? lancesDoEnlace(rede, medicao.id, numero(fibra)!, sentido) : []), [rede, medicao, fibra, sentido]);
  const total = lances.reduce((s, l) => s + l.reservaDe + (l.metros ?? 0), 0);
  const distancia = numero(km);
  const r = medicao && distancia != null ? localizarRompimento(lances, distancia, numero(excesso) ?? 0) : null;
  // Com o KMZ da rota o ponto segue o traçado do cabo; sem ele (ou caixa longe do traçado), linha reta entre as caixas.
  const noTracado = r && medicao && tracado ? rompimentoNoTracado(r, lances, tracado.caminho, medicao) : null;
  // Postes da vistoria com marca de metragem no lance: o ponto fica entre os dois que cercam a marca (o mais preciso).
  const refino = r && r.tipo === "lance" && marcas.length && r.lance.de.latitude != null && r.lance.para.latitude != null
    ? refinarPorMarcas(r, marcas, pertoDoLance(tracado?.caminho ?? null, { lat: r.lance.de.latitude, lng: r.lance.de.longitude! }, { lat: r.lance.para.latitude, lng: r.lance.para.longitude! }))
    : null;
  const ponto = refino ? { lat: refino.lat, lng: refino.lng } : noTracado ? { lat: noTracado.lat, lng: noTracado.lng } : r && r.tipo !== "sem_medida" && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
  const kmzNome = kmzs.find((k) => k.id === kmzId)?.nome_arquivo;

  function baixarKml() {
    if (!r || !medicao || distancia == null) return;
    const titulo = `Rompimento a ${km} km de ${medicao.identificacao}`;
    const desc = `${descreverRompimento(r)}${refino ? ` · ${refino.naReserva ? `na reserva de ${refino.naReserva}` : `entre ${refino.entre[0]} e ${refino.entre[1]}`} (marcas da vistoria)` : ""}. Medido em ${medicao.identificacao}${tracado ? ` · traçado ${rota?.trecho} (${kmzNome})` : ""}.`;
    const kml = (refino || noTracado) && ponto
      ? kmlRompimentoTracado(titulo, desc, ponto,
        medicao.latitude != null && medicao.longitude != null ? { nome: medicao.identificacao, lat: medicao.latitude, lng: medicao.longitude } : null,
        noTracado && tracado && noTracado.sMedicao != null ? trechoEntre(tracado.caminho, noTracado.sMedicao, noTracado.sRompimento) : [])
      : kmlRompimento(r, medicao, distancia, titulo);
    if (!kml) return;
    const url = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rompimento-${medicao.identificacao}-${km.replace(",", ".")}km.kml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Localizar rompimento (OTDR) e metragem do enlace</h2>
      <div className="flex flex-wrap items-end gap-2 border-b border-gray-100 p-4">
        <label className="grid gap-1 text-xs text-gray-500">1 · Rota
          <select className={campo} value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
            <option value="">Escolha a rota...</option>
            {rotas.map((x) => <option key={x.id} value={x.id}>{x.trecho}</option>)}
          </select>
        </label>
        {rotaId && (
          <>
            <label className="grid gap-1 text-xs text-gray-500">2 · KMZ da rota (já usados)
              <select className={campo} value={kmzId} onChange={(e) => setKmzId(e.target.value)}>
                <option value="">{kmzs.length ? "Sem KMZ (linha reta entre as caixas)" : "Nenhum KMZ guardado ainda"}</option>
                {kmzs.map((k) => <option key={k.id} value={k.id}>{k.nome_arquivo} · {new Date(k.criado_em).toLocaleDateString("pt-BR")}{k.extensao_m ? ` · ${fmtMetros(k.extensao_m)}` : ""}</option>)}
              </select>
            </label>
            <label className={`cursor-pointer rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 ${enviando ? "opacity-60" : ""}`}>
              {enviando ? "Lendo KMZ..." : "Inserir o KMZ atual"}
              <input type="file" accept=".kmz,.kml" className="hidden" disabled={enviando}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) inserirKmz(f); }} />
            </label>
          </>
        )}
      </div>
      {rotaId && <div className="flex flex-wrap items-end gap-2 p-4">
        <label className="grid gap-1 text-xs text-gray-500">3 · Medição feita em
          <select className={campo} value={medicaoId} onChange={(e) => {
            setMedicaoId(e.target.value);
            const c = rede.find((x) => x.id === e.target.value);
            if (c) setSentido(sentidoPadrao(c));
          }}>
            <option value="">DGO, entroncamento ou caixa...</option>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.identificacao} · {rotuloPonto(c.tipo, c.swap)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Fibra
          <input className={`${campo} w-20`} inputMode="numeric" value={fibra} onChange={(e) => setFibra(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Sentido da medição
          <select className={campo} value={sentido} onChange={(e) => setSentido(e.target.value as "frente" | "tras")}>
            <option value="frente">Para frente (saídas)</option>
            <option value="tras">Para trás (de onde vem)</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Distância do evento (km)
          <input className={`${campo} w-32`} inputMode="decimal" placeholder="Ex.: 1,100" value={km} onChange={(e) => setKm(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">Excesso de fibra (%)
          <input className={`${campo} w-24`} inputMode="decimal" placeholder="0" value={excesso} onChange={(e) => setExcesso(e.target.value)} />
        </label>
      </div>}

      {medicao && (
        <div className="px-4 pb-4 text-sm">
          {lances.length === 0 ? (
            <p className="text-gray-500">Nenhum ponto cadastrado {sentido === "frente" ? "depois" : "antes"} de {medicao.identificacao} nessa fibra.</p>
          ) : (
            <table className="w-full">
              <thead className="text-left text-xs text-gray-500">
                <tr><th className="py-1">Lance</th><th>Comprimento</th><th>Como foi medido</th><th>Reservas</th><th>Acumulado</th></tr>
              </thead>
              <tbody>
                {(() => {
                  let acumulado = 0;
                  return lances.map((l, i) => {
                    acumulado += l.reservaDe + (l.metros ?? 0);
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1"><b>{l.de.identificacao}</b> → <b>{l.para.identificacao}</b></td>
                        <td>{l.metros == null ? "—" : fmtMetros(l.metros)}</td>
                        <td className={l.fonte === "cabo" ? "text-green-700" : "text-amber-700"}>
                          {l.fonte === "cabo" ? `metragem do cabo (${l.marcaDe} → ${l.marcaPara})` : l.fonte === "gps" ? "estimado pelo GPS" : "sem metragem nem GPS"}
                        </td>
                        <td className="text-xs">
                          {[l.reservaDe ? `${l.reservaDe} m em ${l.de.identificacao}` : null,
                            ...l.reservas.map((x) => `${x.metros} m no caminho${x.obs ? ` (${x.obs})` : ""}`)].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td>{fmtMetros(acumulado)}</td>
                      </tr>
                    );
                  });
                })()}
                <tr className="border-t border-gray-200 font-semibold"><td className="py-1">Enlace</td><td colSpan={3} /><td>{fmtMetros(total)}</td></tr>
              </tbody>
            </table>
          )}

          {r && (
            <div className={`mt-4 rounded-lg border-2 p-4 ${r.tipo === "sem_medida" ? "border-amber-400" : "border-red-500"}`}>
              <div className="text-xs font-bold uppercase tracking-wide text-red-700">{r.tipo === "sem_medida" ? "Falta dado para calcular" : "Possível rompimento"}</div>
              <div className="mt-1 text-base font-semibold">{descreverRompimento(r)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Medição em <b>{medicao.identificacao}</b> ({rotuloPonto(medicao.tipo, medicao.swap)}), fibra {fibra}, {km} km{numero(excesso) ? `, excesso ${excesso}%` : ""}.
                {ponto ? ` Coordenadas ${ponto.lat.toFixed(6)}, ${ponto.lng.toFixed(6)}.` : ""}
              </div>
              {r.tipo !== "sem_medida" && (
                <div className={`mt-1 text-xs ${refino || noTracado ? "text-green-700" : "text-amber-700"}`}>
                  {refino ? (refino.naReserva ? `Na reserva anotada em ${refino.naReserva} (marcas de metragem da vistoria).` : `Entre ${refino.entre[0]} e ${refino.entre[1]}, pelas marcas de metragem da vistoria.`) : noTracado ? `Posição sobre o traçado do KMZ (${kmzNome}).` : tracado ? "Caixas longe do traçado do KMZ: posição em linha reta entre as caixas." : "Sem KMZ: posição em linha reta entre as caixas."}
                </div>
              )}
              {ponto && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${ponto.lat},${ponto.lng}`}>Ver no Google Maps</a>
                  <button className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={baixarKml}>
                    Baixar KML (ponto + medição)
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Lance pela metragem do cabo quando há a marca na saída do ponto anterior e na entrada do seguinte; sem elas, linha reta pelo GPS mais as reservas anotadas.
          </p>
        </div>
      )}
    </section>
  );
}
