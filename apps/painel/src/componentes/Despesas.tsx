"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { baixarXlsx } from "@/lib/planilha";
import { excluirComConfirmacao } from "@/lib/excluir";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Despesa = {
  id: string; tecnico_id: string; tecnico: string; data: string; categoria: string; valor: number; pagamento: string;
  fornecedor: string | null; descricao: string | null; os_numero: number | null; placa: string | null; litros: number | null;
  odometro_km: number | null; combustivel: string | null; comprovante: string | null; status: string; motivo_recusa: string | null;
  conferida_por_nome: string | null; conferida_em: string | null; criado_em: string; latitude: number | null; longitude: number | null;
  km_rodados: number | null; km_por_litro: number | null; preco_litro: number | null;
  reembolso: string | null; reembolso_pago_em: string | null; tipo_manutencao: string | null;
};

const CATEGORIAS: Record<string, string> = {
  combustivel: "Combustível", pedagio: "Pedágio", estacionamento: "Estacionamento", alimentacao: "Alimentação",
  hospedagem: "Hospedagem", ferramenta: "Ferramenta", material: "Material", manutencao_veiculo: "Manutenção do veículo", outros: "Outros",
};
// Gastos do veículo ficam na aba Frota; o resto na aba Despesas.
export const CATEGORIAS_FROTA = ["combustivel", "pedagio", "estacionamento", "manutencao_veiculo"];
const MANUTENCOES: Record<string, string> = {
  troca_oleo: "Troca de óleo", pneu: "Pneu", revisao: "Revisão", freios: "Freios", bateria: "Bateria", funilaria: "Funilaria", lavagem: "Lavagem", outro: "Outro",
};
const PAGAMENTOS: Record<string, string> = { cartao_empresa: "Cartão da empresa", reembolso: "Reembolso ao técnico", adiantamento: "Adiantamento" };
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "A conferir", cor: "bg-amber-100 text-amber-800" },
  aprovada: { rotulo: "Aprovada", cor: "bg-green-100 text-green-800" },
  recusada: { rotulo: "Recusada", cor: "bg-red-100 text-red-800" },
};
const REEMBOLSO: Record<string, string> = { solicitado: "Reembolso solicitado", pago: "Reembolso pago" };
const reais = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const mesAtual = () => new Date().toISOString().slice(0, 7);

// Conferência das despesas lançadas no app: comprovante ao lado dos dados, aprovação e planilha para o financeiro.
export default function Despesas({ tecnicos, frota = false, placa }: { tecnicos: Tecnico[]; frota?: boolean; placa?: string }) {
  const doModo = Object.fromEntries(Object.entries(CATEGORIAS).filter(([k]) => CATEGORIAS_FROTA.includes(k) === frota));
  const [mes, setMes] = useState(mesAtual());
  const [tecnico, setTecnico] = useState("");
  const [status, setStatus] = useState("");
  const [categoria, setCategoria] = useState("");
  const [reembolso, setReembolso] = useState("");
  const [linhas, setLinhas] = useState<Despesa[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<Despesa | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    const [a, m] = mes.split("-").map(Number);
    const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
    let q = supabase.from("despesas_planilha").select("*").gte("data", `${mes}-01`).lt("data", fim);
    if (tecnico) q = q.eq("tecnico_id", tecnico);
    if (status) q = q.eq("status", status);
    if (categoria) q = q.eq("categoria", categoria);
    else q = q.in("categoria", Object.keys(doModo));
    if (placa) q = q.ilike("placa", placa);
    if (reembolso === "todos") q = q.not("reembolso", "is", null);
    else if (reembolso) q = q.eq("reembolso", reembolso);
    q.order("data", { ascending: false }).order("criado_em", { ascending: false }).then(async ({ data }) => {
      const lista = (data as Despesa[]) ?? [];
      setLinhas(lista);
      setMarcadas([]);
      const caminhos = lista.map((d) => d.comprovante).filter((c): c is string => !!c);
      if (!caminhos.length) return setLinks({});
      // Links válidos por 7 dias: servem também para a planilha exportada.
      const { data: assinados } = await supabase.storage.from("despesas").createSignedUrls(caminhos, 7 * 86400);
      setLinks(Object.fromEntries((assinados ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, tecnico, status, categoria, reembolso, versao, frota, placa]);

  useEffect(() => {
    const canal = supabase.channel("despesas")
      .on("postgres_changes", { event: "*", schema: "public", table: "despesas" }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recarregar]);

  const resumo = useMemo(() => {
    const validas = linhas.filter((d) => d.status !== "recusada");
    const porCategoria = new Map<string, number>();
    const porTecnico = new Map<string, number>();
    for (const d of validas) {
      porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + Number(d.valor));
      porTecnico.set(d.tecnico, (porTecnico.get(d.tecnico) ?? 0) + Number(d.valor));
    }
    const comb = validas.filter((d) => d.categoria === "combustivel");
    return {
      total: validas.reduce((t, d) => t + Number(d.valor), 0),
      aConferir: linhas.filter((d) => d.status === "pendente").length,
      litros: comb.reduce((t, d) => t + Number(d.litros ?? 0), 0),
      km: comb.reduce((t, d) => t + Number(d.km_rodados ?? 0), 0),
      aReembolsar: linhas.filter((d) => d.reembolso === "solicitado" && d.status === "aprovada").reduce((t, d) => t + Number(d.valor), 0),
      reembolsoEmConferencia: linhas.filter((d) => d.reembolso === "solicitado" && d.status === "pendente").length,
      porCategoria: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]),
      porTecnico: [...porTecnico.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [linhas]);

  // Sinais para olhar com atenção na conferência.
  const alertas = (d: Despesa) => {
    const a: string[] = [];
    if (!d.comprovante) a.push("sem comprovante");
    if (d.km_rodados != null && d.km_rodados < 0) a.push("odômetro menor que o anterior");
    if (d.km_por_litro != null && (d.km_por_litro < 4 || d.km_por_litro > 20)) a.push(`consumo ${d.km_por_litro} km/L fora do normal`);
    if (d.preco_litro != null && (d.preco_litro < 3 || d.preco_litro > 9)) a.push(`R$ ${d.preco_litro}/L`);
    const dup = linhas.filter((o) => o.id !== d.id && o.tecnico_id === d.tecnico_id && o.data === d.data && Number(o.valor) === Number(d.valor));
    if (dup.length) a.push("possível duplicada");
    return a;
  };

  async function conferir(ids: string[], novo: "aprovada" | "recusada") {
    let motivo: string | null = null;
    if (novo === "recusada") {
      motivo = prompt("Motivo da recusa (o técnico vê no app e pode corrigir):");
      if (!motivo?.trim()) return;
    }
    const { data: sessao } = await supabase.auth.getSession();
    const { error } = await supabase.from("despesas").update({
      status: novo, motivo_recusa: motivo, conferida_por: sessao.session?.user.id, conferida_em: new Date().toISOString(),
    }).in("id", ids);
    if (error) return alert(error.message);
    setAberta(null);
    recarregar();
  }

  async function marcarReembolsoPago(ids: string[]) {
    if (!confirm(`Confirmar que o reembolso de ${ids.length} despesa(s) foi pago ao técnico?`)) return;
    const { data: sessao } = await supabase.auth.getSession();
    const { error } = await supabase.from("despesas").update({
      reembolso: "pago", reembolso_pago_em: new Date().toISOString(), reembolso_pago_por: sessao.session?.user.id,
    }).in("id", ids);
    if (error) return alert(error.message);
    setAberta(null);
    recarregar();
  }

  async function exportar() {
    const cab = ["Data", "Técnico", "Tipo", "Valor (R$)", "Pagamento", "Estabelecimento", "O.S.", "Placa", "Combustível", "Litros",
      "R$/litro", "Odômetro (km)", "Km rodados", "Km/L", "Observação", "Situação", "Motivo recusa", "Conferida por", "Conferida em",
      "Comprovante", "Latitude", "Longitude", "Lançada em", "Reembolso", "Reembolso pago em"];
    const dados = linhas.map((d) => [
      new Date(`${d.data}T12:00:00`), d.tecnico, CATEGORIAS[d.categoria] ?? d.categoria, Number(d.valor), PAGAMENTOS[d.pagamento] ?? d.pagamento,
      d.fornecedor, d.os_numero, d.placa, d.combustivel, d.litros != null ? Number(d.litros) : null,
      d.preco_litro != null ? Number(d.preco_litro) : null, d.odometro_km, d.km_rodados, d.km_por_litro != null ? Number(d.km_por_litro) : null,
      d.descricao, STATUS[d.status]?.rotulo ?? d.status, d.motivo_recusa, d.conferida_por_nome,
      d.conferida_em ? new Date(d.conferida_em) : null,
      d.comprovante && links[d.comprovante] ? { texto: "Abrir foto", url: links[d.comprovante] } : null,
      d.latitude, d.longitude, new Date(d.criado_em),
      d.reembolso ? REEMBOLSO[d.reembolso] : "Não", d.reembolso_pago_em ? new Date(d.reembolso_pago_em) : null,
    ]);
    const decimais = cab.map((c) => c === "Valor (R$)");
    await baixarXlsx(`Despesas ${mes}`, `Despesas ${mes}`, cab, dados, decimais);
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  const pendentesVisiveis = linhas.filter((d) => d.status === "pendente").map((d) => d.id);
  const reembolsosAPagar = linhas.filter((d) => d.reembolso === "solicitado" && d.status === "aprovada").map((d) => d.id);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{frota ? "Gastos da frota" : "Despesas"}</h2>
        <input type="month" className={campo} value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
        <select className={campo} value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(doModo).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={campo} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas as situações</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select className={campo} value={reembolso} onChange={(e) => setReembolso(e.target.value)}>
          <option value="">Com e sem reembolso</option>
          <option value="todos">Só reembolsos</option>
          <option value="solicitado">Reembolso a pagar</option>
          <option value="pago">Reembolso pago</option>
        </select>
        <button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!linhas.length} onClick={exportar}>Baixar planilha (Excel)</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Total no mês</div>
          <div className="mt-1 text-2xl font-semibold">{reais(resumo.total)}</div>
          <div className="text-xs text-gray-500">sem as recusadas</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">A conferir</div>
          <div className={`mt-1 text-2xl font-semibold ${resumo.aConferir ? "text-amber-600" : ""}`}>{resumo.aConferir}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Reembolso a pagar</div>
          <div className={`mt-1 text-2xl font-semibold ${resumo.aReembolsar ? "text-blue-700" : ""}`}>{reais(resumo.aReembolsar)}</div>
          <div className="text-xs text-gray-500">
            {resumo.reembolsoEmConferencia ? `+ ${resumo.reembolsoEmConferencia} pedido(s) em conferência` : "aprovados, ainda não pagos"}
          </div>
          {reembolsosAPagar.length > 0 && (
            <button className="mt-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => marcarReembolsoPago(reembolsosAPagar)}>
              Marcar {reembolsosAPagar.length} como pago(s)
            </button>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Combustível</div>
          <div className="mt-1 text-2xl font-semibold">{resumo.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</div>
          <div className="text-xs text-gray-500">{resumo.km.toLocaleString("pt-BR")} km entre abastecimentos</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Por tipo</div>
          {resumo.porCategoria.slice(0, 4).map(([c, v]) => (
            <div key={c} className="flex justify-between"><span>{CATEGORIAS[c] ?? c}</span><span className="font-medium">{reais(v)}</span></div>
          ))}
        </div>
      </div>

      <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 p-3 text-sm">
          <span className="text-gray-500">{linhas.length} despesa(s)</span>
          {marcadas.length > 0 && (
            <>
              <button className="ml-auto rounded-md bg-green-700 px-3 py-1.5 font-medium text-white" onClick={() => conferir(marcadas, "aprovada")}>
                Aprovar {marcadas.length} marcada(s)
              </button>
              <button className="rounded-md border border-gray-300 px-3 py-1.5" onClick={() => setMarcadas([])}>Limpar</button>
            </>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="p-3">
                <input type="checkbox" disabled={!pendentesVisiveis.length}
                  checked={pendentesVisiveis.length > 0 && marcadas.length === pendentesVisiveis.length}
                  onChange={(e) => setMarcadas(e.target.checked ? pendentesVisiveis : [])} />
              </th>
              <th className="p-3">Data</th><th className="p-3">Técnico</th><th className="p-3">Tipo</th><th className="p-3">Detalhe</th>
              <th className="p-3 text-right">Valor</th><th className="p-3">Situação</th><th className="p-3">Comprovante</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((d) => {
              const a = alertas(d);
              return (
                <tr key={d.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setAberta(d)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {d.status === "pendente" && (
                      <input type="checkbox" checked={marcadas.includes(d.id)}
                        onChange={(e) => setMarcadas((m) => (e.target.checked ? [...m, d.id] : m.filter((x) => x !== d.id)))} />
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">{br(d.data)}</td>
                  <td className="p-3">{d.tecnico}</td>
                  <td className="p-3">{CATEGORIAS[d.categoria] ?? d.categoria}{d.tipo_manutencao ? ` · ${MANUTENCOES[d.tipo_manutencao] ?? d.tipo_manutencao}` : ""}{frota && d.placa && d.categoria !== "combustivel" ? <div className="text-xs text-gray-500">{d.placa}</div> : null}</td>
                  <td className="p-3">
                    <div>{[d.fornecedor, d.os_numero ? `O.S. ${d.os_numero}` : null].filter(Boolean).join(" · ")}</div>
                    {d.categoria === "combustivel" && (
                      <div className="text-xs text-gray-500">
                        {d.placa} · {d.litros} L · {d.odometro_km?.toLocaleString("pt-BR")} km
                        {d.km_por_litro != null ? ` · ${d.km_por_litro} km/L` : ""}{d.preco_litro != null ? ` · R$ ${d.preco_litro}/L` : ""}
                      </div>
                    )}
                    {a.length > 0 && <div className="text-xs font-medium text-red-700">⚠ {a.join(" · ")}</div>}
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{reais(d.valor)}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[d.status]?.cor ?? ""}`}>{STATUS[d.status]?.rotulo ?? d.status}</span>
                    {d.reembolso && (
                      <div className={`mt-1 text-xs font-medium whitespace-nowrap ${d.reembolso === "pago" ? "text-green-700" : "text-blue-700"}`}>
                        {REEMBOLSO[d.reembolso]}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {d.comprovante && links[d.comprovante]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={links[d.comprovante]} alt="" className="h-12 w-12 rounded object-cover" />
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhuma despesa com esses filtros.</p>}
      </section>

      {resumo.porTecnico.length > 1 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <h3 className="mb-2 font-semibold">Por técnico</h3>
          {resumo.porTecnico.map(([t, v]) => (
            <div key={t} className="flex justify-between border-t border-gray-100 py-1.5 first:border-0"><span>{t}</span><span className="font-medium">{reais(v)}</span></div>
          ))}
        </section>
      )}

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAberta(null)}>
          <div className="grid max-h-[90vh] w-full max-w-5xl gap-4 overflow-auto rounded-xl bg-white p-4 lg:grid-cols-[3fr_2fr]" onClick={(e) => e.stopPropagation()}>
            <div className="flex min-h-64 items-center justify-center rounded-lg bg-gray-100">
              {aberta.comprovante && links[aberta.comprovante] ? (
                /\.pdf$/i.test(aberta.comprovante)
                  ? <a className="text-blue-700 underline" href={links[aberta.comprovante]} target="_blank" rel="noreferrer">Abrir PDF</a>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <a href={links[aberta.comprovante]} target="_blank" rel="noreferrer"><img src={links[aberta.comprovante]} alt="Comprovante" className="max-h-[80vh] w-auto" /></a>
              ) : <span className="text-gray-500">Sem comprovante</span>}
            </div>
            <div className="grid content-start gap-1 text-sm">
              <div className="flex items-start">
                <h3 className="mr-auto text-lg font-semibold">{CATEGORIAS[aberta.categoria]} · {reais(aberta.valor)}</h3>
                <button className="text-gray-500" onClick={() => setAberta(null)}>✕</button>
              </div>
              <Info r="Técnico" v={aberta.tecnico} />
              <Info r="Data" v={br(aberta.data)} />
              <Info r="Pagamento" v={PAGAMENTOS[aberta.pagamento]} />
              {aberta.reembolso && (
                <Info r="Reembolso" v={aberta.reembolso === "pago" && aberta.reembolso_pago_em
                  ? `Pago em ${new Date(aberta.reembolso_pago_em).toLocaleDateString("pt-BR")}` : "Solicitado pelo técnico"} />
              )}
              <Info r="Estabelecimento" v={aberta.fornecedor} />
              <Info r="O.S." v={aberta.os_numero} />
              {aberta.categoria === "combustivel" && (
                <>
                  <Info r="Placa" v={aberta.placa} />
                  <Info r="Combustível" v={aberta.combustivel} />
                  <Info r="Litros" v={aberta.litros} />
                  <Info r="Preço por litro" v={aberta.preco_litro != null ? reais(aberta.preco_litro) : null} />
                  <Info r="Odômetro" v={aberta.odometro_km?.toLocaleString("pt-BR")} />
                  <Info r="Km desde o último" v={aberta.km_rodados} />
                  <Info r="Consumo" v={aberta.km_por_litro != null ? `${aberta.km_por_litro} km/L` : null} />
                </>
              )}
              <Info r="Observação" v={aberta.descricao} />
              {aberta.latitude != null && (
                <Info r="Local do lançamento" v={
                  <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps?q=${aberta.latitude},${aberta.longitude}`}>ver no mapa</a>} />
              )}
              <Info r="Situação" v={STATUS[aberta.status]?.rotulo} />
              {aberta.motivo_recusa && <Info r="Motivo" v={aberta.motivo_recusa} />}
              {aberta.conferida_por_nome && <Info r="Conferida por" v={`${aberta.conferida_por_nome}, ${new Date(aberta.conferida_em!).toLocaleString("pt-BR")}`} />}
              {alertas(aberta).length > 0 && <p className="mt-2 font-medium text-red-700">⚠ {alertas(aberta).join(" · ")}</p>}
              <div className="mt-3 flex gap-2">
                {aberta.status !== "aprovada" && (
                  <button className="rounded-lg bg-green-700 px-4 py-2 font-medium text-white" onClick={() => conferir([aberta.id], "aprovada")}>Aprovar</button>
                )}
                {aberta.status !== "recusada" && (
                  <button className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-700" onClick={() => conferir([aberta.id], "recusada")}>Recusar</button>
                )}
                <button className="ml-auto rounded-lg border border-red-300 px-4 py-2 font-medium text-red-700"
                  onClick={async () => {
                    const ok = await excluirComConfirmacao(`a despesa de ${reais(aberta.valor)} de ${aberta.tecnico}`, () => supabase.from("despesas").delete().eq("id", aberta.id));
                    if (!ok) return;
                    if (aberta.comprovante) await supabase.storage.from("despesas").remove([aberta.comprovante]);
                    setAberta(null);
                    recarregar();
                  }}>Excluir</button>
                {aberta.status === "aprovada" && aberta.reembolso === "solicitado" && (
                  <button className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white" onClick={() => marcarReembolsoPago([aberta.id])}>Marcar reembolso pago</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ r, v }: { r: string; v: React.ReactNode }) {
  if (v == null || v === "") return null;
  return <div className="flex gap-2 border-b border-gray-100 py-1"><span className="w-36 shrink-0 text-gray-500">{r}</span><span>{v}</span></div>;
}
