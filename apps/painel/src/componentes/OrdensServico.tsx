"use client";

import { useCallback, useEffect, useState } from "react";

import AutorizarPausa from "@/componentes/AutorizarPausa";
import DetalheOS from "@/componentes/DetalheOS";
import ExcluirDados from "@/componentes/ExcluirDados";
import MaterialApoio from "@/componentes/MaterialApoio";
import NovaOS from "@/componentes/NovaOS";
import { supabase } from "@/lib/supabase";
import { corStatus, OrdemServico, rotuloDaOs, StatusOS, Tecnico } from "@/lib/tipos";

const FILTROS: { rotulo: string; status: StatusOS[] | null }[] = [
  { rotulo: "Backlog", status: ["rascunho"] },
  { rotulo: "Em campo", status: ["enviada", "aceita", "em_execucao", "pausada", "devolvida"] },
  { rotulo: "Aguardando baixa", status: ["concluida"] },
  { rotulo: "Baixadas", status: ["baixada"] },
  { rotulo: "Todas", status: null },
];

function data(valor: string | null) {
  return valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default function OrdensServico({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [filtro, setFiltro] = useState(0);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [novaAberta, setNovaAberta] = useState(false);
  const [apoio, setApoio] = useState<OrdemServico | null>(null);
  const [detalhe, setDetalhe] = useState<OrdemServico | null>(null);
  const [pausa, setPausa] = useState<OrdemServico | null>(null);
  const [excluir, setExcluir] = useState<OrdemServico | null>(null);

  const [versao, setVersao] = useState(0);
  const carregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let consulta = supabase
      .from("ordens_servico")
      .select("*, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome)")
      .order("criado_em", { ascending: false })
      .limit(200);
    const status = FILTROS[filtro].status;
    if (status) consulta = consulta.in("status", status);
    consulta.then(({ data }) => setOrdens((data as OrdemServico[]) ?? []));
  }, [filtro, versao]);

  useEffect(() => {
    const canal = supabase
      .channel("painel-os")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function mudarStatus(os: OrdemServico, status: StatusOS, pedirMotivo = false) {
    let observacao_supervisor = os.observacao_supervisor;
    if (pedirMotivo) {
      const motivo = window.prompt("O que o técnico precisa corrigir?");
      if (!motivo) return;
      observacao_supervisor = motivo;
    }
    const { error } = await supabase.from("ordens_servico").update({ status, observacao_supervisor }).eq("id", os.id);
    if (error) alert(error.message);
  }

  async function atribuir(os: OrdemServico, tecnicoId: string) {
    const { error } = await supabase
      .from("ordens_servico")
      .update({ tecnico_id: tecnicoId || null })
      .eq("id", os.id);
    if (error) alert(error.message);
  }

  const agora = new Date();
  const botao = "rounded-md px-2.5 py-1 text-sm font-medium";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f, i) => (
          <button key={f.rotulo} onClick={() => setFiltro(i)}
            className={`rounded-full px-3 py-1.5 text-sm ${i === filtro ? "bg-blue-700 text-white" : "bg-white text-gray-700 border border-gray-200"}`}>
            {f.rotulo}
          </button>
        ))}
        <button className="ml-auto rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800" onClick={() => setNovaAberta(true)}>
          + Nova O.S.
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="p-3">O.S.</th>
              <th className="p-3">Título</th>
              <th className="p-3">Técnico</th>
              <th className="p-3">Status</th>
              <th className="p-3">SLA (4h) / idade</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordens.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhuma O.S. neste filtro.</td></tr>
            )}
            {ordens.map((os) => {
              const emAberto = !["concluida", "baixada", "cancelada"].includes(os.status);
              const limite = os.sla_limite ?? os.prazo;
              const restante = limite ? Math.round((new Date(limite).getTime() - agora.getTime()) / 60000) : null;
              const atrasada = emAberto && restante != null && restante < 0;
              const perto = emAberto && restante != null && restante >= 0 && restante <= 60;
              return (
                <tr key={os.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="p-3">
                    <button className="font-mono text-blue-700 hover:underline" onClick={() => setDetalhe(os)}>#{os.numero}</button>
                    {os.ticket_acionamento && <div className="font-mono text-xs text-gray-500">{os.ticket_interno ? "Token" : "Ticket"} {os.ticket_acionamento}</div>}
                    {os.criada_por === os.tecnico_id && <div className="text-xs font-medium text-green-700">Aberta pelo técnico em campo</div>}
                  </td>
                  <td className="p-3">
                    <button className="text-left font-medium text-blue-700 hover:underline" onClick={() => setDetalhe(os)}>{os.titulo}</button>
                    <div className="text-gray-500">{os.tipo} · prioridade {os.prioridade}{os.endereco ? ` · ${os.endereco}` : ""}</div>
                    {os.observacao_tecnico && <div className="mt-1 text-gray-700">Técnico: {os.observacao_tecnico}</div>}
                    {os.pausa_solicitada_em && (
                      <div className="mt-1 rounded bg-orange-50 px-2 py-1 text-orange-800">
                        Pausa solicitada: {os.pausa_motivo ?? "sem motivo"}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {os.status === "rascunho" ? (
                      <select className="rounded border border-gray-300 p-1" value={os.tecnico_id ?? ""} onChange={(e) => atribuir(os, e.target.value)}>
                        <option value="">—</option>
                        {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    ) : (os.tecnico?.nome ?? "—")}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatus[os.status]}`}>{rotuloDaOs(os)}</span>
                  </td>
                  <td className={`p-3 ${atrasada ? "font-semibold text-red-700" : perto ? "font-semibold text-amber-700" : ""}`}>
                    {limite ? data(limite) : emAberto ? <Idade criadoEm={os.criado_em} agora={agora} /> : "—"}
                    {emAberto && restante != null && (
                      <div className="text-xs">{restante < 0 ? `vencido há ${-restante} min` : `${Math.floor(restante / 60)}h${String(restante % 60).padStart(2, "0")} restantes`}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {os.pausa_solicitada_em && (
                        <button className={`${botao} bg-orange-600 text-white`} onClick={() => setPausa(os)}>Autorizar pausa</button>
                      )}
                      <button className={`${botao} border border-gray-300`} onClick={() => setApoio(os)}>Apoio</button>
                      {os.status === "rascunho" && (
                        <button className={`${botao} bg-blue-700 text-white disabled:opacity-40`} disabled={!os.tecnico_id}
                          title={os.tecnico_id ? "" : "Escolha o técnico na coluna ao lado"}
                          onClick={() => mudarStatus(os, "enviada")}>Despachar</button>
                      )}
                      {os.status === "concluida" && (
                        <>
                          <button className={`${botao} bg-green-700 text-white`} onClick={() => mudarStatus(os, "baixada")}>Dar baixa</button>
                          <button className={`${botao} border border-gray-300`} onClick={() => mudarStatus(os, "devolvida", true)}>Devolver</button>
                        </>
                      )}
                      {!["baixada", "cancelada", "concluida"].includes(os.status) && (
                        <button className={`${botao} text-red-700 hover:bg-red-50`}
                          onClick={() => confirm(`Cancelar a O.S. #${os.numero}?`) && mudarStatus(os, "cancelada")}>Cancelar</button>
                      )}
                      <button className={`${botao} text-red-700 hover:bg-red-50`} title="Apagar a O.S. de vez"
                        onClick={() => setExcluir(os)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {excluir && <ExcluirDados tipo="os" id={excluir.id} nome={`O.S. #${excluir.numero}`} fechar={() => setExcluir(null)} aoExcluir={carregar} />}
      {pausa && <AutorizarPausa os={pausa} tecnicos={tecnicos} fechar={() => setPausa(null)} />}
      {detalhe && <DetalheOS os={detalhe} fechar={() => setDetalhe(null)} />}
      {apoio && <MaterialApoio osId={apoio.id} numero={apoio.numero} fechar={() => setApoio(null)} />}
      {novaAberta && <NovaOS tecnicos={tecnicos} fechar={() => setNovaAberta(false)} criada={carregar} />}
    </section>
  );
}

// O.S. sem SLA (ocorrências e correções da preventiva): idade desde a abertura. Até 24h verde, até 48h amarelo, depois vermelho.
function Idade({ criadoEm, agora }: { criadoEm: string; agora: Date }) {
  const horas = Math.max(0, (agora.getTime() - new Date(criadoEm).getTime()) / 3_600_000);
  const cor = horas < 24 ? "bg-green-50 text-green-700" : horas < 48 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  const texto = horas < 48 ? `${Math.floor(horas)}h` : `${Math.floor(horas / 24)}d ${Math.floor(horas % 24)}h`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`} title="Sem SLA: 24h verde, 48h amarelo, 72h vermelho">
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> aberta há {texto}
    </span>
  );
}
