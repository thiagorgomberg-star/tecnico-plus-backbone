"use client";

import { useEffect, useMemo, useState } from "react";

import EscolherTrechoKmz from "@/componentes/EscolherTrechoKmz";
import { fmtMetros, ReservasAvulsas, totalReservasAvulsas } from "@/lib/fusao";
import { analisarSor, curvaCompleta, km as fmtKm, lerSor, Nivel, Sor } from "@/lib/sor";
import { supabase } from "@/lib/supabase";
import { comprimento, eventosNoTracado, kmlEventosCurva, pontaDoTracado, TracadoSalvo } from "@/lib/tracado";

type Rota = { id: string; trecho: string };
type KmzSalvo = { id: string; rota_id: string; nome_arquivo: string; extensao_m: number | null; criado_em: string };
type CurvaGuardada = { chave: string; nome: string; bucket: string; caminho: string; detalhe: string };

const COR: Record<Nivel, string> = { ok: "#1E9E4A", atencao: "#D99A00", critico: "#D0453B" };
const numero = (t: string) => { const v = Number(t.replace(",", ".")); return t.trim() && Number.isFinite(v) ? v : null; };

// Simula onde ficam, no mapa, os eventos de uma curva do OTDR usando só a curva e o KMZ do trecho
// (não depende das caixas mapeadas). Desconta excesso de fibra e as reservas técnicas (quantidade × metros).
export default function SimularCurvaKmz() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [kmzs, setKmzs] = useState<KmzSalvo[]>([]);
  const [curvas, setCurvas] = useState<CurvaGuardada[]>([]);
  const carregarKmzs = () => supabase.from("rota_kmz").select("id, rota_id, nome_arquivo, extensao_m, criado_em").order("criado_em", { ascending: false })
    .then(({ data }) => setKmzs(data ?? []));
  useEffect(() => {
    supabase.from("rotas").select("id, trecho").eq("ativo", true).order("trecho").then(({ data }) => setRotas(data ?? []));
    carregarKmzs();
    Promise.all([
      supabase.from("curvas_analisadas").select("id, nome_arquivo, caminho_arquivo, fibra, sentido, criado_em").order("criado_em", { ascending: false }).limit(100),
      supabase.rpc("curvas_trecho", { p_limite: 20 }),
    ]).then(([a, t]) => {
      const lista: CurvaGuardada[] = [
        ...((t.data as { origem: string; nome: string; bucket: string; caminho: string; fibra: number | null; tirada_em: string }[]) ?? [])
          .filter((c) => c.origem === "arquivo" && /\.sor$/i.test(c.nome))
          .map((c) => ({ chave: `t:${c.caminho}`, nome: c.nome, bucket: c.bucket, caminho: c.caminho, detalhe: `trecho · ${new Date(`${c.tirada_em}T12:00:00`).toLocaleDateString("pt-BR")}${c.fibra ? ` · fibra ${c.fibra}` : ""}` })),
        ...((a.data as { id: string; nome_arquivo: string; caminho_arquivo: string; fibra: string | null; sentido: string | null; criado_em: string }[]) ?? [])
          .map((c) => ({ chave: `a:${c.id}`, nome: c.nome_arquivo, bucket: "curvas", caminho: c.caminho_arquivo, detalhe: `analisada · ${new Date(c.criado_em).toLocaleDateString("pt-BR")}${c.fibra ? ` · fibra ${c.fibra}` : ""}${c.sentido ? ` · ${c.sentido === "AB" ? "A→B" : "B→A"}` : ""}` })),
      ];
      setCurvas(lista);
    });
  }, []);

  // 1) Curva
  const [curvaChave, setCurvaChave] = useState("");
  const [bruto, setBruto] = useState<Sor | null>(null);
  const [nomeCurva, setNomeCurva] = useState("");
  const [erroCurva, setErroCurva] = useState("");
  const [modo, setModo] = useState<"completa" | "otdr">("completa");
  async function abrirCurva(dados: Blob | null, nome: string) {
    setBruto(null); setErroCurva("");
    if (!dados) return setErroCurva("Não foi possível baixar a curva.");
    try { setBruto(lerSor(new Uint8Array(await dados.arrayBuffer()))); setNomeCurva(nome); } catch { setErroCurva("Este arquivo não é uma curva .SOR válida."); }
  }
  useEffect(() => {
    const c = curvas.find((x) => x.chave === curvaChave);
    if (c) supabase.storage.from(c.bucket).download(c.caminho).then(({ data }) => abrirCurva(data, c.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curvaChave]);
  const sor = useMemo(() => (bruto ? (modo === "completa" ? curvaCompleta(bruto) : bruto) : null), [bruto, modo]);

  // 2) KMZ
  const [rotaId, setRotaId] = useState("");
  const [kmzId, setKmzId] = useState("");
  const [tracado, setTracado] = useState<TracadoSalvo | null>(null);
  const [nomeKmz, setNomeKmz] = useState("");
  const [novoKmz, setNovoKmz] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (!kmzId) return;
    const k = kmzs.find((x) => x.id === kmzId);
    supabase.from("rota_kmz").select("tracado").eq("id", kmzId).single().then(({ data }) => {
      setTracado((data?.tracado as TracadoSalvo) ?? null);
      setNomeKmz(k ? `${rotas.find((r) => r.id === k.rota_id)?.trecho ?? ""} · ${k.nome_arquivo}` : "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kmzId]);
  // Guarda o trecho escolhido na rota: fica na lista "já enviados" do painel e no app.
  async function guardarNaRota(t: TracadoSalvo, nome: string, arquivo: File) {
    if (!rotaId) return;
    setGuardando(true);
    const id = crypto.randomUUID();
    const caminho = `${rotaId}/${id}.${/\.kml$/i.test(arquivo.name) ? "kml" : "kmz"}`;
    const envio = await supabase.storage.from("kmz").upload(caminho, arquivo);
    const { error } = await supabase.from("rota_kmz").insert({ id, rota_id: rotaId, nome_arquivo: `${arquivo.name} (${nome})`.slice(0, 200), caminho_arquivo: envio.error ? null : caminho, tracado: t, extensao_m: Math.round(comprimento(t.caminho)) });
    setGuardando(false);
    if (error) return alert(`O trecho foi usado, mas não foi guardado na rota: ${error.message}`);
    await carregarKmzs();
    setKmzId(id);
  }

  // 3) Medição e reservas
  const [ponta, setPonta] = useState<"inicio" | "fim">("inicio");
  const [excesso, setExcesso] = useState("");
  const [qtdReservas, setQtdReservas] = useState("");
  const [metrosReserva, setMetrosReserva] = useState("");
  const [modoReserva, setModoReserva] = useState<ReservasAvulsas["modo"]>("distribuidas");
  const reservas: ReservasAvulsas | null = numero(qtdReservas) && numero(metrosReserva) ? { quantidade: numero(qtdReservas)!, metros: numero(metrosReserva)!, modo: modoReserva } : null;

  const cam = useMemo(() => (tracado ? (ponta === "fim" ? [...tracado.caminho].reverse() : tracado.caminho) : []), [tracado, ponta]);
  const pontas = tracado && tracado.caminho.length >= 2 ? [pontaDoTracado(tracado.caminho, tracado.pontos, false), pontaDoTracado(tracado.caminho, tracado.pontos, true)] : null;
  const L = cam.length >= 2 ? comprimento(cam) : 0;
  const analise = useMemo(() => (sor ? analisarSor(sor) : null), [sor]);
  const resultado = useMemo(() => {
    if (!sor || !analise || cam.length < 2 || !tracado) return null;
    const lista = analise.diagnosticos.filter((d, i) => !(i === 0 && d.evento.distanciaKm < 0.05));
    const pos = eventosNoTracado(cam, tracado.pontos, lista.map((d) => d.evento.distanciaKm), { excessoPct: numero(excesso) ?? 0, reservas });
    // Fibra que acaba antes do fim do traçado (mais de 3% antes): possível rompimento nesse ponto.
    return lista.map((d, i) => {
      const curta = d.evento.fimDeFibra && pos[i].metrosCabo < L * 0.97;
      return { d: curta ? { ...d, nivel: "critico" as Nivel, tipo: "Fim da fibra · possível rompimento",
        texto: `A fibra termina ${fmtMetros(L - pos[i].metrosCabo)} antes do fim do traçado: possível rompimento neste ponto.` } : d, p: pos[i] };
    });
  }, [sor, analise, cam, L, tracado, excesso, reservas?.quantidade, reservas?.metros, reservas?.modo]);

  const medicaoNome = pontas ? (pontas[ponta === "fim" ? 1 : 0].nome ?? (ponta === "fim" ? "Fim do traçado" : "Início do traçado")) : "";
  function baixarKml() {
    if (!resultado || !pontas) return;
    const m = pontas[ponta === "fim" ? 1 : 0];
    const kml = kmlEventosCurva(`Eventos da curva ${nomeCurva}`, { nome: medicaoNome, lat: m.lat, lng: m.lng },
      resultado.map(({ d, p }) => ({
        nome: `${d.evento.numero} · ${fmtKm(d.evento.distanciaKm)} · ${d.tipo}`,
        desc: `${d.texto} Perda ${d.evento.perdaDb.toFixed(3).replace(".", ",")} dB. Cabo a ${fmtMetros(p.metrosCabo)} de ${medicaoNome}${p.alemM ? ` (passa ${fmtMetros(p.alemM)} do fim do traçado)` : ""}${p.perto ? ` · perto de ${p.perto.nome}` : ""}.`,
        nivel: d.nivel, ponto: p.ponto,
      })));
    const url = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
    Object.assign(document.createElement("a"), { href: url, download: `eventos-${nomeCurva.replace(/\.sor$/i, "")}.kml` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <h2 className="font-semibold">Simular eventos da curva no KMZ</h2>
        <p className="text-xs text-gray-500">Usa a curva do OTDR e o traçado do KMZ (não precisa das caixas mapeadas). Desconta o excesso de fibra e as reservas técnicas.</p>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <div className="text-xs font-bold uppercase text-gray-500">1 · Curva do OTDR</div>
          <label className="grid gap-1 text-xs text-gray-500">Curva já enviada
            <select className={campo} value={curvaChave} onChange={(e) => setCurvaChave(e.target.value)}>
              <option value="">{curvas.length ? "Escolha a curva..." : "Nenhuma curva .SOR guardada"}</option>
              {curvas.map((c) => <option key={c.chave} value={c.chave}>{c.nome} · {c.detalhe}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-gray-500">Ou um arquivo .SOR do computador
            <input type="file" className={campo} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setCurvaChave(""); abrirCurva(f, f.name); } }} />
          </label>
          {erroCurva ? <p className="text-sm text-red-700">{erroCurva}</p> : null}
          {bruto ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {([["otdr", "Somente eventos do OTDR"], ["completa", "Ler a curva toda"]] as const).map(([m, t]) => (
                <button key={m} onClick={() => setModo(m)}
                  className={`rounded-lg border px-2 py-1 ${modo === m ? "border-[#163A6B] bg-[#163A6B] text-white" : "border-gray-300 hover:bg-gray-50"}`}>{t}</button>
              ))}
              <span className="text-gray-500">{nomeCurva} · {bruto.comprimentoOndaNm} nm · {sor?.eventos.length} eventos{bruto.localA || bruto.localB ? ` · ${bruto.localA || "?"} → ${bruto.localB || "?"}` : ""}</span>
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-2">
          <div className="text-xs font-bold uppercase text-gray-500">2 · KMZ do trecho</div>
          <label className="grid gap-1 text-xs text-gray-500">KMZ já enviado
            <select className={campo} value={kmzId} onChange={(e) => setKmzId(e.target.value)}>
              <option value="">{kmzs.length ? "Escolha o KMZ..." : "Nenhum KMZ guardado ainda"}</option>
              {kmzs.map((k) => <option key={k.id} value={k.id}>{rotas.find((r) => r.id === k.rota_id)?.trecho ?? "Rota"} · {k.nome_arquivo}{k.extensao_m ? ` · ${fmtMetros(k.extensao_m)}` : ""}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-gray-500">Guardar o novo KMZ na rota
              <select className={campo} value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
                <option value="">Só usar agora (não guardar)</option>
                {rotas.map((r) => <option key={r.id} value={r.id}>{r.trecho}</option>)}
              </select>
            </label>
            <label className={`cursor-pointer rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 ${guardando ? "opacity-60" : ""}`}>
              {guardando ? "Guardando..." : "Enviar KMZ"}
              <input type="file" accept=".kmz,.kml" className="hidden" disabled={guardando} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setNovoKmz(f); }} />
            </label>
          </div>
          {tracado ? <p className="text-xs text-gray-500">Traçado: {nomeKmz} · {fmtMetros(comprimento(tracado.caminho))} · {tracado.pontos.length} ponto(s) do KMZ perto do cabo</p> : null}
        </div>
      </div>

      {tracado && pontas ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 p-4">
          <label className="grid gap-1 text-xs text-gray-500">3 · OTDR ligado em
            <select className={campo} value={ponta} onChange={(e) => setPonta(e.target.value as "inicio" | "fim")}>
              <option value="inicio">{pontas[0].nome ?? "Início do traçado"} (ponta 1)</option>
              <option value="fim">{pontas[1].nome ?? "Fim do traçado"} (ponta 2)</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-gray-500">Reservas técnicas (quantidade)
            <input className={`${campo} w-28`} inputMode="numeric" placeholder="Ex.: 4" value={qtdReservas} onChange={(e) => setQtdReservas(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">Metros de cada reserva
            <input className={`${campo} w-28`} inputMode="decimal" placeholder="Ex.: 50" value={metrosReserva} onChange={(e) => setMetrosReserva(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">Onde estão as reservas
            <select className={campo} value={modoReserva} onChange={(e) => setModoReserva(e.target.value as ReservasAvulsas["modo"])}>
              <option value="distribuidas">Espalhadas pelo trecho</option>
              <option value="antes">Todas antes dos eventos</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-gray-500">Excesso de fibra (%)
            <input className={`${campo} w-24`} inputMode="decimal" placeholder="0" value={excesso} onChange={(e) => setExcesso(e.target.value)} />
          </label>
          <span className="pb-2 text-xs text-gray-500">
            Cabo no KMZ: {fmtMetros(L)}{reservas ? ` · reservas: ${fmtMetros(totalReservasAvulsas(reservas))}` : ""}{sor ? ` · fibra no OTDR: ${fmtKm(analise?.comprimentoKm ?? 0)}` : ""}
          </span>
        </div>
      ) : null}

      {resultado && pontas ? (
        <div className="border-t border-gray-100 p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <b>{resultado.length} evento(s) no mapa, medidos de {medicaoNome}</b>
            <button className="ml-auto rounded-lg border border-blue-700 px-3 py-1.5 font-semibold text-blue-700 hover:bg-blue-50" onClick={baixarKml}>Baixar KML (todos os eventos)</button>
          </div>
          <table className="w-full text-left">
            <thead className="text-xs text-gray-500">
              <tr><th className="py-1">#</th><th>Na fibra (OTDR)</th><th>No cabo</th><th>Tipo</th><th>Perda</th><th>Situação</th><th>Onde</th><th /></tr>
            </thead>
            <tbody>
              {resultado.map(({ d, p }) => (
                <tr key={d.evento.numero} className="border-t border-gray-100 align-top">
                  <td className="py-1.5 font-mono">{d.evento.numero}</td>
                  <td className="whitespace-nowrap">{fmtKm(d.evento.distanciaKm)}</td>
                  <td className="whitespace-nowrap">{fmtMetros(p.metrosCabo)}</td>
                  <td>{d.tipo}{d.evento.detectado ? <div className="text-[10px] font-semibold uppercase text-[#163A6B]">lido da curva</div> : null}</td>
                  <td className="whitespace-nowrap">{d.evento.perdaDb.toFixed(3).replace(".", ",")} dB</td>
                  <td><span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${COR[d.nivel]}1F`, color: COR[d.nivel] }}>{d.nivel === "ok" ? "OK" : d.nivel === "atencao" ? "Atenção" : "Crítico"}</span></td>
                  <td className="text-xs text-gray-700">
                    {p.alemM ? <span className="text-amber-700">Passa {fmtMetros(p.alemM)} do fim do traçado. </span> : null}
                    {p.perto ? `Perto de ${p.perto.nome} (${Math.round(p.perto.dist)} m). ` : ""}
                    {p.ponto.lat.toFixed(6)}, {p.ponto.lng.toFixed(6)}
                  </td>
                  <td><a className="text-xs font-semibold text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${p.ponto.lat},${p.ponto.lng}`}>Mapa</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            Metros de cabo = distância do OTDR sem o excesso de fibra e sem as reservas técnicas{reservas?.modo === "distribuidas" ? " (espalhadas: desconto proporcional ao longo do trecho)" : reservas ? " (todas antes: desconto inteiro)" : ""}. O ponto anda pelo traçado do KMZ a partir da ponta escolhida.
          </p>
        </div>
      ) : null}

      {novoKmz ? (
        <EscolherTrechoKmz arquivo={novoKmz} fechar={() => setNovoKmz(null)} aoEscolher={(t, nome) => {
          const arq = novoKmz;
          setNovoKmz(null); setKmzId(""); setTracado(t); setNomeKmz(`${arq.name} (${nome})`);
          if (rotaId) guardarNaRota(t, nome, arq);
        }} />
      ) : null}
    </section>
  );
}
