"use client";

import { useCallback, useEffect, useState } from "react";

import Despesas from "@/componentes/Despesas";
import KmExpedientes from "@/componentes/KmExpedientes";
import { supabase } from "@/lib/supabase";
import { Tecnico } from "@/lib/tipos";

type Veiculo = {
  id: string; placa: string; marca: string | null; modelo: string | null; ano: number | null; cor: string | null;
  combustivel: string | null; renavam: string | null; tecnico_id: string | null; tecnico: string | null; odometro_km: number | null;
  oleo_intervalo_km: number; oleo_intervalo_dias: number; observacao: string | null; ativo: boolean;
  km_atual: number | null; ultimo_abastecimento: string | null; abastecimentos: number; gasto_combustivel: number;
  ultima_troca_oleo: string | null; km_ultima_troca_oleo: number | null; proxima_troca_km: number | null; proxima_troca_data: string | null;
  situacao_oleo: "ok" | "proxima" | "vencida" | "sem_registro";
};
type Manutencao = {
  id: string; tipo: string; data: string; odometro_km: number | null; valor: number | null; oficina: string | null; descricao: string | null;
};

const MANUTENCOES: Record<string, string> = {
  troca_oleo: "Troca de óleo", pneu: "Pneu", revisao: "Revisão", freios: "Freios", bateria: "Bateria", funilaria: "Funilaria", lavagem: "Lavagem", outro: "Outro",
};
const COMBUSTIVEIS: Record<string, string> = { flex: "Flex", gasolina: "Gasolina", etanol: "Etanol", diesel: "Diesel", gnv: "GNV" };
const OLEO: Record<Veiculo["situacao_oleo"], { rotulo: string; cor: string }> = {
  ok: { rotulo: "Óleo em dia", cor: "bg-green-100 text-green-800" },
  proxima: { rotulo: "Troca de óleo próxima", cor: "bg-amber-100 text-amber-800" },
  vencida: { rotulo: "Troca de óleo vencida", cor: "bg-red-100 text-red-800" },
  sem_registro: { rotulo: "Sem troca de óleo registrada", cor: "bg-gray-100 text-gray-600" },
};
const reais = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const km = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR")} km`);
const campo = "rounded-lg border border-gray-300 p-2 text-sm";

const VAZIO = { placa: "", marca: "", modelo: "", ano: "", cor: "", combustivel: "flex", renavam: "", odometro_km: "", oleo_intervalo_km: "10000", oleo_intervalo_dias: "180", observacao: "" };

// Frota: veículos da base, técnico que usa cada um, troca de óleo/manutenção e gastos (abastecimento, pedágio...).
export default function Frota({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Veiculo | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("veiculos_situacao").select("*").order("ativo", { ascending: false }).order("placa")
      .then(({ data }) => setVeiculos((data as Veiculo[]) ?? []));
  }, [versao]);

  function editar(v: Veiculo | null) {
    setErro("");
    setEditando(v?.id ?? null);
    setForm(v ? {
      placa: v.placa, marca: v.marca ?? "", modelo: v.modelo ?? "", ano: v.ano ? String(v.ano) : "", cor: v.cor ?? "",
      combustivel: v.combustivel ?? "flex", renavam: v.renavam ?? "", odometro_km: v.odometro_km != null ? String(v.odometro_km) : "",
      oleo_intervalo_km: String(v.oleo_intervalo_km), oleo_intervalo_dias: String(v.oleo_intervalo_dias), observacao: v.observacao ?? "",
    } : VAZIO);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const linha = {
      placa: form.placa.trim().toUpperCase(), marca: form.marca.trim() || null, modelo: form.modelo.trim() || null,
      ano: form.ano ? Number(form.ano) : null, cor: form.cor.trim() || null, combustivel: form.combustivel || null,
      renavam: form.renavam.trim() || null, odometro_km: form.odometro_km ? Number(form.odometro_km) : null,
      oleo_intervalo_km: Number(form.oleo_intervalo_km) || 10000, oleo_intervalo_dias: Number(form.oleo_intervalo_dias) || 180,
      observacao: form.observacao.trim() || null,
    };
    const { error } = editando
      ? await supabase.from("veiculos").update(linha).eq("id", editando)
      : await supabase.from("veiculos").insert(linha);
    if (error) return setErro(error.message.includes("veiculos_placa_idx") ? "Já existe um veículo com essa placa." : error.message);
    setForm(null);
    recarregar();
  }

  async function vincular(v: Veiculo, tecnicoId: string) {
    // Um veículo por técnico: solta o que ele tinha antes.
    if (tecnicoId) await supabase.from("veiculos").update({ tecnico_id: null }).eq("tecnico_id", tecnicoId).neq("id", v.id);
    const { error } = await supabase.from("veiculos").update({ tecnico_id: tecnicoId || null }).eq("id", v.id);
    if (error) alert(error.message);
    recarregar();
  }

  async function excluir(v: Veiculo) {
    if (!confirm(`Excluir o veículo ${v.placa}? O histórico de manutenção dele também será apagado.`)) return;
    if (prompt(`Para confirmar, digite a placa ${v.placa}:`)?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") !== v.placa.toUpperCase().replace(/[^A-Z0-9]/g, "")) {
      return alert("Placa não confere. Nada foi excluído.");
    }
    const { error } = await supabase.from("veiculos").delete().eq("id", v.id);
    if (error) return alert(error.message);
    if (aberto?.id === v.id) setAberto(null);
    recarregar();
  }

  const f = (k: keyof typeof VAZIO, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1 text-xs text-gray-600">
      {rotulo}
      <input className={campo} value={form?.[k] ?? ""} onChange={(e) => setForm((x) => x && { ...x, [k]: e.target.value })} {...props} />
    </label>
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
          <h2 className="mr-auto text-lg font-semibold">Frota</h2>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => editar(null)}>+ Cadastrar veículo</button>
        </div>

        {form && (
          <form onSubmit={salvar} className="grid gap-3 border-b border-gray-100 bg-gray-50 p-4 sm:grid-cols-4">
            {f("placa", "Placa *", { required: true, placeholder: "ABC1D23" })}
            {f("marca", "Marca", { placeholder: "Fiat" })}
            {f("modelo", "Modelo *", { required: true, placeholder: "Strada" })}
            {f("cor", "Cor", { placeholder: "Branca" })}
            {f("ano", "Ano", { type: "number", min: 1980, max: 2100 })}
            <label className="grid gap-1 text-xs text-gray-600">
              Combustível
              <select className={campo} value={form.combustivel} onChange={(e) => setForm({ ...form, combustivel: e.target.value })}>
                {Object.entries(COMBUSTIVEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {f("renavam", "Renavam")}
            {f("odometro_km", "Km atual (no cadastro)", { type: "number", min: 0 })}
            {f("oleo_intervalo_km", "Troca de óleo a cada (km)", { type: "number", min: 1 })}
            {f("oleo_intervalo_dias", "…ou a cada (dias)", { type: "number", min: 1 })}
            <label className="grid gap-1 text-xs text-gray-600 sm:col-span-2">
              Observação
              <input className={campo} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-4">
              <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">{editando ? "Salvar alterações" : "Cadastrar"}</button>
              <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => setForm(null)}>Cancelar</button>
              {erro && <span className="text-sm text-red-700">{erro}</span>}
            </div>
          </form>
        )}

        {veiculos.length === 0 && !form && <p className="p-4 text-sm text-gray-500">Nenhum veículo cadastrado ainda.</p>}
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {veiculos.map((v) => (
            <div key={v.id} className={`rounded-lg border p-3 text-sm ${v.ativo ? "border-gray-200" : "border-dashed border-gray-300 opacity-60"}`}>
              <div className="flex items-start gap-2">
                <div className="mr-auto">
                  <div className="font-mono text-lg font-bold tracking-wider">{v.placa}</div>
                  <div className="text-gray-700">{[v.marca, v.modelo, v.ano].filter(Boolean).join(" ")}{v.cor ? ` · ${v.cor}` : ""}</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${OLEO[v.situacao_oleo].cor}`}>{OLEO[v.situacao_oleo].rotulo}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                <span>Km atual: <b className="text-gray-800">{km(v.km_atual)}</b></span>
                <span>Último abastec.: {br(v.ultimo_abastecimento)}</span>
                <span>Última troca de óleo: {br(v.ultima_troca_oleo)}</span>
                <span>Próxima: {v.proxima_troca_km ? km(v.proxima_troca_km) : "—"}{v.proxima_troca_data ? ` ou ${br(v.proxima_troca_data)}` : ""}</span>
                <span>Combustível (total): {reais(v.gasto_combustivel)}</span>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                Técnico:
                <select className="flex-1 rounded border border-gray-300 p-1 text-sm" value={v.tecnico_id ?? ""} onChange={(e) => vincular(v, e.target.value)}>
                  <option value="">— sem técnico —</option>
                  {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button className="text-blue-700 hover:underline" onClick={() => setAberto(v)}>Manutenções</button>
                <button className="text-blue-700 hover:underline" onClick={() => editar(v)}>Editar</button>
                <button className="text-gray-600 hover:underline" onClick={async () => { await supabase.from("veiculos").update({ ativo: !v.ativo, ...(v.ativo ? { tecnico_id: null } : {}) }).eq("id", v.id); recarregar(); }}>
                  {v.ativo ? "Desativar" : "Reativar"}
                </button>
                <button className="ml-auto text-red-700 hover:underline" onClick={() => excluir(v)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <KmExpedientes tecnicos={tecnicos} />

      <Despesas tecnicos={tecnicos} frota />

      {aberto && <Manutencoes veiculo={aberto} fechar={() => setAberto(null)} aoMudar={recarregar} />}
    </div>
  );
}

function Manutencoes({ veiculo, fechar, aoMudar }: { veiculo: Veiculo; fechar: () => void; aoMudar: () => void }) {
  const [lista, setLista] = useState<Manutencao[]>([]);
  const [nova, setNova] = useState({ tipo: "troca_oleo", data: new Date().toISOString().slice(0, 10), odometro_km: "", valor: "", oficina: "", descricao: "" });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    supabase.from("veiculo_manutencoes").select("*").eq("veiculo_id", veiculo.id).order("data", { ascending: false })
      .then(({ data }) => setLista((data as Manutencao[]) ?? []));
  }, [veiculo.id, versao]);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (nova.tipo === "troca_oleo" && !nova.odometro_km) return alert("Informe o km da troca de óleo (conta para o próximo aviso).");
    const { error } = await supabase.from("veiculo_manutencoes").insert({
      veiculo_id: veiculo.id, tipo: nova.tipo, data: nova.data, odometro_km: nova.odometro_km ? Number(nova.odometro_km) : null,
      valor: nova.valor ? Number(nova.valor.replace(",", ".")) : null, oficina: nova.oficina.trim() || null, descricao: nova.descricao.trim() || null,
    });
    if (error) return alert(error.message);
    setNova({ ...nova, odometro_km: "", valor: "", oficina: "", descricao: "" });
    setVersao((v) => v + 1);
    aoMudar();
  }

  async function apagar(m: Manutencao) {
    if (!confirm(`Excluir o registro de ${MANUTENCOES[m.tipo]} de ${br(m.data)}?`)) return;
    if (!confirm("Tem certeza? Não dá para desfazer.")) return;
    const { error } = await supabase.from("veiculo_manutencoes").delete().eq("id", m.id);
    if (error) return alert(error.message);
    setVersao((v) => v + 1);
    aoMudar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <h2 className="mr-auto text-lg font-semibold">Manutenções · {veiculo.placa}</h2>
          <button className="text-2xl leading-none text-gray-500" onClick={fechar} aria-label="Fechar">×</button>
        </div>
        <form onSubmit={lancar} className="grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
          <select className={campo} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })}>
            {Object.entries(MANUTENCOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" className={campo} value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} required />
          <input type="number" min={0} className={campo} placeholder="Km" value={nova.odometro_km} onChange={(e) => setNova({ ...nova, odometro_km: e.target.value })} />
          <input className={campo} placeholder="Valor (R$)" inputMode="decimal" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} />
          <input className={campo} placeholder="Oficina" value={nova.oficina} onChange={(e) => setNova({ ...nova, oficina: e.target.value })} />
          <input className={campo} placeholder="O que foi feito" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 sm:col-span-3">Registrar manutenção</button>
        </form>
        <p className="mt-2 text-xs text-gray-500">Trocas de óleo e manutenções pagas pelo técnico no app também contam (aparecem em Gastos da frota).</p>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {lista.length === 0 && <tr><td className="p-2 text-gray-500">Nenhuma manutenção registrada pelo painel.</td></tr>}
            {lista.map((m) => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="p-2 whitespace-nowrap">{br(m.data)}</td>
                <td className="p-2 font-medium">{MANUTENCOES[m.tipo] ?? m.tipo}</td>
                <td className="p-2">{km(m.odometro_km)}</td>
                <td className="p-2">{[m.oficina, m.descricao].filter(Boolean).join(" · ")}</td>
                <td className="p-2 text-right">{reais(m.valor)}</td>
                <td className="p-2 text-right"><button className="text-xs text-red-700 hover:underline" onClick={() => apagar(m)}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
