"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { excluirComConfirmacao } from "@/lib/excluir";
import { AbaXlsx, baixarXlsxAbas, Celula } from "@/lib/planilha";
import { supabase } from "@/lib/supabase";

// Vistoria Backbone MG: produção do dia (postes, trocas, ocorrências, caixas e km), exportação para o gerente
// e o planejamento da vistoria com o andamento atualizado à mão.

const VISTORIA = "Vistoria Backbone MG";
const FUSO = "America/Sao_Paulo";

type Ponto = {
  id: string; os_id: string; categoria: "poste" | "ocorrencia"; identificacao: string | null; endereco: string | null;
  localizada_em: string | null; criado_em: string; material: string | null; estado_base: string | null; inclinado: boolean | null;
  rachado: boolean | null; estai: string | null; precisa_troca: boolean; tipo_via: string | null; via_nome: string | null;
  ocorrencia: string | null; gravidade: string | null; observacao: string | null; latitude: number | null; longitude: number | null;
  os_numero: number; os_titulo: string; tecnico_id: string | null; tecnico: string | null;
};
type OS = { id: string; numero: number; titulo: string; tecnico_id: string | null; status: string };
type CaixaV = { id: string; os_id: string; identificacao: string; tipo: string; localizada_em: string | null; criado_em: string; endereco: string | null };
type Expediente = { tecnico_id: string; inicio: string; km_inicial: number | null; km_final: number | null; distancia_gps_km: number | null };
type Plano = { id: string; data: string; trecho: string; atividade: string; base: string | null; equipe: string | null; status: string; observacao: string | null };
type Usuario = { id: string; nome: string };

const ROTULOS: Record<string, string> = {
  madeira: "Madeira", eucalipto_tratado: "Eucalipto tratado", concreto: "Concreto", metalico: "Metálico", outro: "Outro",
  ok: "OK", podre: "Podre", cupim: "Cupim", erosao: "Erosão no pé", frouxo: "Frouxo", ausente: "Faltando", nao_tem: "Não precisa",
  rodovia_federal: "Rodovia federal (DNIT)", rodovia_estadual: "Rodovia estadual (DER-MG)", concessionaria: "Rodovia concedida",
  vicinal: "Estrada vicinal", urbana: "Área urbana", particular: "Propriedade particular",
  cabo_exposto: "Cabo exposto", flecha_baixa: "Flecha baixa", vegetacao: "Vegetação", travessia: "Travessia",
  reserva_tecnica: "Reserva técnica", cabo_danificado: "Cabo danificado", ferragem: "Ferragem / ancoragem", roedor: "Roedor",
  baixa: "Baixa", media: "Média", alta: "Alta", emenda: "Emenda", entroncamento: "Entroncamento", dgo: "DGO", site: "Site",
};
const rotulo = (v: string | null | undefined) => (v ? ROTULOS[v] ?? v : "");
const STATUS_PLANO: [string, string][] = [["planejado", "Planejado"], ["em_andamento", "Em andamento"], ["concluido", "Concluído"], ["adiado", "Adiado"]];
const COR_STATUS: Record<string, string> = {
  planejado: "bg-gray-100 text-gray-700", em_andamento: "bg-amber-100 text-amber-800", concluido: "bg-green-100 text-green-800", adiado: "bg-red-100 text-red-800",
};

// Dia (AAAA-MM-DD) no fuso de São Paulo.
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: FUSO });
const hoje = () => diaDe(new Date().toISOString());
const dataBr = (dia: string) => dia.split("-").reverse().join("/");
const comoData = (dia: string) => { const [a, m, d] = dia.split("-").map(Number); return new Date(a, m - 1, d); };
const trechoDe = (titulo: string) => titulo.match(/^(BB|SP|SJC)-\d+/i)?.[0].toUpperCase() ?? titulo;
const quando = (p: { localizada_em: string | null; criado_em: string }) => p.localizada_em ?? p.criado_em;
const kmDe = (e: Expediente) => (e.km_inicial != null && e.km_final != null ? e.km_final - e.km_inicial : e.distancia_gps_km ?? null);

type LinhaProducao = {
  dia: string; tecnico: string; trechos: string[]; km: number | null; postes: number; troca: number; ocorrencias: number; alta: number; caixas: number;
};

export default function VistoriaMG() {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [caixas, setCaixas] = useState<CaixaV[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [novo, setNovo] = useState({ data: hoje(), trecho: "", atividade: "", base: "", equipe: "" });
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      const [p, o, pl, u] = await Promise.all([
        supabase.from("vistoria_pontos_mapa").select("*").order("localizada_em").limit(10000),
        supabase.from("ordens_servico").select("id, numero, titulo, tecnico_id, status").eq("tipo", VISTORIA).limit(2000),
        supabase.from("vistoria_planejamento").select("*").order("data").order("trecho"),
        supabase.from("usuarios").select("id, nome"),
      ]);
      const os = (o.data as OS[]) ?? [];
      const ids = os.map((x) => x.id);
      const tecnicos = [...new Set(os.map((x) => x.tecnico_id).filter(Boolean))] as string[];
      const [c, e] = await Promise.all([
        ids.length ? supabase.from("caixas_emenda").select("id, os_id, identificacao, tipo, localizada_em, criado_em, endereco").in("os_id", ids).limit(5000)
          : Promise.resolve({ data: [] }),
        tecnicos.length ? supabase.from("expedientes").select("tecnico_id, inicio, km_inicial, km_final, distancia_gps_km").in("tecnico_id", tecnicos)
          .order("inicio", { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
      ]);
      if (!ativo) return;
      setPontos((p.data as Ponto[]) ?? []);
      setOrdens(os);
      setCaixas((c.data as CaixaV[]) ?? []);
      setExpedientes((e.data as Expediente[]) ?? []);
      setPlanos((pl.data as Plano[]) ?? []);
      setUsuarios((u.data as Usuario[]) ?? []);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [versao]);

  const nomeDe = useCallback((id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "—", [usuarios]);
  const osDe = useCallback((id: string) => ordens.find((o) => o.id === id), [ordens]);
  const noPeriodo = useCallback((iso: string) => { const d = diaDe(iso); return d >= de && d <= ate; }, [de, ate]);

  const pontosPeriodo = useMemo(() => pontos.filter((p) => noPeriodo(quando(p))), [pontos, noPeriodo]);
  const caixasPeriodo = useMemo(() => caixas.filter((c) => noPeriodo(quando(c))), [caixas, noPeriodo]);

  // Produção por dia e técnico (soma postes, trocas, ocorrências, caixas e km do expediente).
  const producao = useMemo(() => {
    const mapa = new Map<string, LinhaProducao & { tecnicoId: string | null }>();
    const linha = (dia: string, tecnicoId: string | null) => {
      const chave = `${dia}|${tecnicoId}`;
      if (!mapa.has(chave)) mapa.set(chave, { dia, tecnicoId, tecnico: nomeDe(tecnicoId), trechos: [], km: null, postes: 0, troca: 0, ocorrencias: 0, alta: 0, caixas: 0 });
      return mapa.get(chave)!;
    };
    for (const p of pontosPeriodo) {
      const l = linha(diaDe(quando(p)), p.tecnico_id);
      const t = trechoDe(p.os_titulo);
      if (!l.trechos.includes(t)) l.trechos.push(t);
      if (p.categoria === "poste") { l.postes++; if (p.precisa_troca) l.troca++; } else { l.ocorrencias++; if (p.gravidade === "alta") l.alta++; }
    }
    for (const c of caixasPeriodo) {
      const os = osDe(c.os_id);
      const l = linha(diaDe(quando(c)), os?.tecnico_id ?? null);
      l.caixas++;
      const t = os ? trechoDe(os.titulo) : null;
      if (t && !l.trechos.includes(t)) l.trechos.push(t);
    }
    for (const l of mapa.values()) {
      const km = expedientes.filter((e) => e.tecnico_id === l.tecnicoId && diaDe(e.inicio) === l.dia).map(kmDe).filter((k): k is number => k != null);
      l.km = km.length ? km.reduce((a, b) => a + b, 0) : null;
    }
    return [...mapa.values()].sort((a, b) => (a.dia === b.dia ? a.tecnico.localeCompare(b.tecnico) : a.dia < b.dia ? 1 : -1));
  }, [pontosPeriodo, caixasPeriodo, expedientes, nomeDe, osDe]);

  const totais = useMemo(() => producao.reduce((t, l) => ({
    km: t.km + (l.km ?? 0), postes: t.postes + l.postes, troca: t.troca + l.troca, ocorrencias: t.ocorrencias + l.ocorrencias, alta: t.alta + l.alta, caixas: t.caixas + l.caixas,
  }), { km: 0, postes: 0, troca: 0, ocorrencias: 0, alta: 0, caixas: 0 }), [producao]);

  // Realizado no dia planejado (todos os técnicos), para comparar com o plano.
  const realizadoNoDia = useCallback((dia: string) => {
    const doDia = pontos.filter((p) => diaDe(quando(p)) === dia);
    return { postes: doDia.filter((p) => p.categoria === "poste").length, caixas: caixas.filter((c) => diaDe(quando(c)) === dia).length };
  }, [pontos, caixas]);

  const andamento = useMemo(() => {
    const total = planos.filter((p) => p.trecho !== "Reserva").length;
    const feitos = planos.filter((p) => p.trecho !== "Reserva" && p.status === "concluido").length;
    return { total, feitos, pct: total ? Math.round((feitos / total) * 100) : 0 };
  }, [planos]);

  async function exportar() {
    const coord = (p: Ponto) => (p.latitude != null ? `${p.latitude.toFixed(6)}, ${p.longitude!.toFixed(6)}` : "");
    const mapa = (p: Ponto) => (p.latitude != null ? { texto: "Mapa", url: `https://www.google.com/maps?q=${p.latitude},${p.longitude}` } : "");
    const abas: AbaXlsx[] = [
      {
        nome: "Produção do dia",
        cabecalho: ["Data", "Técnico", "Trecho(s)", "Km rodado", "Postes vistoriados", "Postes p/ troca", "Ocorrências", "Ocorrências graves", "Caixas cadastradas"],
        linhas: [
          ...producao.map((l): Celula[] => [comoData(l.dia), l.tecnico, l.trechos.join(", "), l.km, l.postes, l.troca, l.ocorrencias, l.alta, l.caixas]),
          ["TOTAL", "", "", totais.km, totais.postes, totais.troca, totais.ocorrencias, totais.alta, totais.caixas],
        ],
      },
      {
        nome: "Postes",
        cabecalho: ["Data", "Técnico", "Trecho", "O.S.", "Poste", "Material", "Base", "Inclinado", "Rachado", "Estai", "Precisa troca", "Tipo de via", "Via / km", "Coordenadas", "Mapa", "Endereço", "Observação"],
        linhas: pontosPeriodo.filter((p) => p.categoria === "poste").map((p): Celula[] => [
          comoData(diaDe(quando(p))), p.tecnico ?? "", trechoDe(p.os_titulo), p.os_numero, p.identificacao ?? "", rotulo(p.material), rotulo(p.estado_base),
          p.inclinado ? "Sim" : "Não", p.rachado ? "Sim" : "Não", rotulo(p.estai), p.precisa_troca ? "SIM" : "Não", rotulo(p.tipo_via), p.via_nome ?? "",
          coord(p), mapa(p), p.endereco ?? "", p.observacao ?? "",
        ]),
      },
      {
        nome: "Ocorrências",
        cabecalho: ["Data", "Técnico", "Trecho", "O.S.", "Ocorrência", "Gravidade", "Tipo de via", "Via / km", "Coordenadas", "Mapa", "Endereço", "Observação"],
        linhas: pontosPeriodo.filter((p) => p.categoria === "ocorrencia").map((p): Celula[] => [
          comoData(diaDe(quando(p))), p.tecnico ?? "", trechoDe(p.os_titulo), p.os_numero, rotulo(p.ocorrencia), rotulo(p.gravidade), rotulo(p.tipo_via),
          p.via_nome ?? "", coord(p), mapa(p), p.endereco ?? "", p.observacao ?? "",
        ]),
      },
      {
        nome: "Caixas",
        cabecalho: ["Data", "Técnico", "Trecho", "O.S.", "TAG", "Tipo", "Endereço"],
        linhas: caixasPeriodo.map((c): Celula[] => {
          const os = osDe(c.os_id);
          return [comoData(diaDe(quando(c))), nomeDe(os?.tecnico_id ?? null), os ? trechoDe(os.titulo) : "", os?.numero ?? "", c.identificacao, rotulo(c.tipo), c.endereco ?? ""];
        }),
      },
      {
        nome: "Planejamento",
        cabecalho: ["Data", "Trecho", "Atividade", "Base / pernoite", "Equipe", "Status", "Postes no dia", "Caixas no dia", "Observação"],
        linhas: planos.map((p): Celula[] => {
          const r = realizadoNoDia(p.data);
          return [comoData(p.data), p.trecho, p.atividade, p.base ?? "", p.equipe ?? "", STATUS_PLANO.find(([v]) => v === p.status)?.[1] ?? p.status, r.postes, r.caixas, p.observacao ?? ""];
        }),
      },
    ];
    const periodo = de === ate ? dataBr(de).replace(/\//g, "-") : `${dataBr(de).replace(/\//g, "-")} a ${dataBr(ate).replace(/\//g, "-")}`;
    await baixarXlsxAbas(`Vistoria Backbone MG - ${periodo}`, abas);
  }

  async function atualizarPlano(p: Plano, campos: Partial<Plano>) {
    const { error } = await supabase.from("vistoria_planejamento").update(campos).eq("id", p.id);
    if (error) alert(error.message);
    recarregar();
  }

  async function incluirPlano(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("vistoria_planejamento").insert({
      data: novo.data, trecho: novo.trecho.trim(), atividade: novo.atividade.trim(), base: novo.base.trim() || null, equipe: novo.equipe.trim() || null,
    });
    if (error) return alert(error.message);
    setNovo({ ...novo, atividade: "" });
    recarregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  const atalho = (dias: number) => {
    const fim = hoje();
    const ini = comoData(fim);
    ini.setDate(ini.getDate() - (dias - 1));
    setDe(`${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, "0")}-${String(ini.getDate()).padStart(2, "0")}`);
    setAte(fim);
  };

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
          <h2 className="mr-auto text-lg font-semibold">Vistoria Backbone MG · Produção</h2>
          <label className="text-sm text-gray-600">De</label>
          <input type="date" className={campo} value={de} onChange={(e) => setDe(e.target.value || hoje())} />
          <label className="text-sm text-gray-600">até</label>
          <input type="date" className={campo} value={ate} onChange={(e) => setAte(e.target.value || hoje())} />
          <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setDe(hoje()); setAte(hoje()); }}>Hoje</button>
          <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => atalho(7)}>7 dias</button>
          <button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={carregando}
            onClick={exportar}>Baixar planilha para o gerente (Excel)</button>
        </div>

        <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ["Postes vistoriados", totais.postes, ""], ["Postes p/ troca", totais.troca, totais.troca ? "text-red-700" : ""],
            ["Ocorrências", totais.ocorrencias, ""], ["Ocorrências graves", totais.alta, totais.alta ? "text-red-700" : ""],
            ["Caixas cadastradas", totais.caixas, ""], ["Km rodado", totais.km.toLocaleString("pt-BR"), ""],
          ] as [string, string | number, string][]).map(([r, v, cor]) => (
            <div key={r} className="bg-white p-4">
              <div className={`text-2xl font-semibold ${cor}`}>{v}</div>
              <div className="text-xs text-gray-500">{r}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-gray-500">
              <tr><th className="p-3">Data</th><th className="p-3">Técnico</th><th className="p-3">Trecho(s)</th><th className="p-3 text-right">Km</th>
                <th className="p-3 text-right">Postes</th><th className="p-3 text-right">P/ troca</th><th className="p-3 text-right">Ocorrências</th>
                <th className="p-3 text-right">Graves</th><th className="p-3 text-right">Caixas</th></tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={9} className="p-4 text-gray-500">Carregando...</td></tr>}
              {!carregando && producao.length === 0 && <tr><td colSpan={9} className="p-4 text-gray-500">Nenhuma produção no período.</td></tr>}
              {producao.map((l) => (
                <tr key={`${l.dia}-${l.tecnico}`} className="border-t border-gray-100">
                  <td className="p-3 whitespace-nowrap">{dataBr(l.dia)}</td>
                  <td className="p-3">{l.tecnico}</td>
                  <td className="p-3">{l.trechos.join(", ")}</td>
                  <td className="p-3 text-right">{l.km != null ? l.km.toLocaleString("pt-BR") : "—"}</td>
                  <td className="p-3 text-right">{l.postes}</td>
                  <td className={`p-3 text-right ${l.troca ? "font-semibold text-red-700" : ""}`}>{l.troca}</td>
                  <td className="p-3 text-right">{l.ocorrencias}</td>
                  <td className={`p-3 text-right ${l.alta ? "font-semibold text-red-700" : ""}`}>{l.alta}</td>
                  <td className="p-3 text-right">{l.caixas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 text-xs text-gray-500">
          Km vem do expediente (km final − inicial; sem km digitado, usa o GPS). A planilha traz as abas Produção do dia, Postes, Ocorrências, Caixas e Planejamento, com link para o mapa de cada ponto.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
          <h2 className="mr-auto text-lg font-semibold">Planejamento da vistoria</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="h-2 w-40 overflow-hidden rounded bg-gray-100"><div className="h-2 bg-green-600" style={{ width: `${andamento.pct}%` }} /></div>
            {andamento.feitos}/{andamento.total} dias concluídos ({andamento.pct}%)
          </div>
        </div>
        <form onSubmit={incluirPlano} className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
          <input type="date" className={campo} value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} required />
          <input className={`${campo} w-24`} placeholder="Trecho" value={novo.trecho} onChange={(e) => setNovo({ ...novo, trecho: e.target.value })} required />
          <input className={`${campo} min-w-56 flex-1`} placeholder="Atividade" value={novo.atividade} onChange={(e) => setNovo({ ...novo, atividade: e.target.value })} required />
          <input className={`${campo} w-40`} placeholder="Base / pernoite" value={novo.base} onChange={(e) => setNovo({ ...novo, base: e.target.value })} />
          <input className={`${campo} w-48`} placeholder="Equipe" value={novo.equipe} onChange={(e) => setNovo({ ...novo, equipe: e.target.value })} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Incluir</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-gray-500">
              <tr><th className="p-3">Data</th><th className="p-3">Trecho</th><th className="p-3">Atividade</th><th className="p-3">Base</th>
                <th className="p-3">Status</th><th className="p-3 text-right">Postes no dia</th><th className="p-3 text-right">Caixas no dia</th><th className="p-3">Observação</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {planos.length === 0 && <tr><td colSpan={9} className="p-4 text-gray-500">Nenhum dia planejado.</td></tr>}
              {planos.map((p) => {
                const r = realizadoNoDia(p.data);
                return (
                  <tr key={p.id} className={`border-t border-gray-100 ${p.data === hoje() ? "bg-blue-50/50" : ""}`}>
                    <td className="p-3 whitespace-nowrap">{dataBr(p.data)}</td>
                    <td className="p-3 font-medium">{p.trecho}</td>
                    <td className="p-3">{p.atividade}</td>
                    <td className="p-3 text-gray-600">{p.base}</td>
                    <td className="p-3">
                      <select className={`rounded px-2 py-1 text-xs font-medium ${COR_STATUS[p.status] ?? ""}`} value={p.status}
                        onChange={(e) => atualizarPlano(p, { status: e.target.value })}>
                        {STATUS_PLANO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-right">{r.postes || "—"}</td>
                    <td className="p-3 text-right">{r.caixas || "—"}</td>
                    <td className="p-3">
                      <input key={`${p.id}-${p.observacao}`} className="w-48 rounded border border-transparent px-1 hover:border-gray-200" defaultValue={p.observacao ?? ""}
                        placeholder="—" onBlur={(e) => e.target.value !== (p.observacao ?? "") && atualizarPlano(p, { observacao: e.target.value.trim() || null })} />
                    </td>
                    <td className="p-3 text-right">
                      <button className="text-xs text-red-700 hover:underline"
                        onClick={async () => (await excluirComConfirmacao(`o dia ${dataBr(p.data)} (${p.trecho})`, () => supabase.from("vistoria_planejamento").delete().eq("id", p.id))) && recarregar()}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 text-xs text-gray-500">Mude o status de cada dia conforme o andamento. &quot;Postes no dia&quot; e &quot;Caixas no dia&quot; vêm do que foi lançado no app naquela data.</p>
      </section>
    </div>
  );
}
