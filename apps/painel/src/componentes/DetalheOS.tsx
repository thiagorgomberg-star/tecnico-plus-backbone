"use client";

import { useCallback, useEffect, useState } from "react";

import CaixaDetalhe, { CaixaPainel } from "@/componentes/CaixaDetalhe";
import { baixarKmz } from "@/componentes/CaixasRede";
import EditarOS from "@/componentes/EditarOS";
import MaterialApoio from "@/componentes/MaterialApoio";
import ExecucaoOS from "@/componentes/ExecucaoOS";
import ReabrirOS from "@/componentes/ReabrirOS";
import { supabase } from "@/lib/supabase";
import { corStatus, ENCERRADAS, OrdemServico, rotuloDaOs, rotuloStatus, StatusOS } from "@/lib/tipos";

const EM_ANDAMENTO: StatusOS[] = ["enviada", "aceita", "em_execucao", "pausada", "devolvida"];

type Anexo = {
  id: string; tipo: string; caminho_arquivo: string; nome_arquivo: string | null; descricao: string | null;
  tirada_em: string | null; criado_em: string; url?: string;
};
type Evento = {
  id: number; status_anterior: StatusOS | null; status_novo: StatusOS; criado_em: string; observacao: string | null;
  usuario: { nome: string } | null;
};
type Local = { latitude: number; longitude: number; evento_localizado_em: string; evento_precisao_m: number | null };

const quando = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Detalhe da O.S. para o supervisor: dados, histórico, local do evento e fotos chegando em tempo real.
export default function DetalheOS({ os: inicial, fechar }: { os: OrdemServico; fechar: () => void }) {
  const [os, setOs] = useState(inicial);
  const [material, setMaterial] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [local, setLocal] = useState<Local | null>(null);
  const [foto, setFoto] = useState<Anexo | null>(null);
  const [caixas, setCaixas] = useState<CaixaPainel[]>([]);
  const [reabrir, setReabrir] = useState(false);
  const [editar, setEditar] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("ordens_servico").select("*, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome)").eq("id", inicial.id).single()
      .then(({ data }) => data && setOs(data as OrdemServico));
    supabase.from("os_eventos").select("id, status_anterior, status_novo, criado_em, observacao, usuario:usuarios(nome)")
      .eq("os_id", inicial.id).order("criado_em")
      .then(({ data }) => setEventos((data as unknown as Evento[]) ?? []));
    supabase.from("eventos_mapa").select("latitude, longitude, evento_localizado_em, evento_precisao_m").eq("id", inicial.id).maybeSingle()
      .then(({ data }) => setLocal(data));
    supabase.from("caixas_mapa").select("*").eq("os_id", inicial.id).order("localizada_em")
      .then(({ data }) => setCaixas((data as unknown as CaixaPainel[]) ?? []));
    supabase.from("os_anexos").select("id, tipo, caminho_arquivo, nome_arquivo, descricao, tirada_em, criado_em")
      .eq("os_id", inicial.id).order("criado_em")
      .then(async ({ data }) => {
        const lista = data ?? [];
        if (lista.length === 0) return setAnexos([]);
        const { data: urls } = await supabase.storage.from("os-anexos").createSignedUrls(lista.map((a) => a.caminho_arquivo), 3600);
        setAnexos(lista.map((a, i) => ({ ...a, url: urls?.[i]?.signedUrl ?? undefined })));
      });
  }, [inicial.id, versao]);

  useEffect(() => {
    const filtro = `os_id=eq.${inicial.id}`;
    const canal = supabase
      .channel(`detalhe-os-${inicial.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "os_anexos", filter: filtro }, recarregar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "os_eventos", filter: filtro }, recarregar)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ordens_servico", filter: `id=eq.${inicial.id}` }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "caixas_emenda", filter: filtro }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [inicial.id, recarregar]);

  const encerrada = ENCERRADAS.includes(os.status);

  // Supervisor tira a O.S. do técnico (e do apoio) e devolve ao backlog geral, com motivo.
  async function voltarBacklog() {
    const motivo = prompt(`Voltar a O.S. #${os.numero} ao backlog?\nEla sai do técnico e qualquer técnico poderá assumir.\n\nMotivo (obrigatório):`)?.trim();
    if (!motivo) return;
    const { error } = await supabase.rpc("voltar_para_backlog", { p_os: os.id, p_motivo: motivo });
    if (error) return alert(error.message);
    await supabase.from("os_tecnicos_apoio").delete().eq("os_id", os.id);
    fechar();
  }
  const fotos = anexos.filter((a) => a.tipo === "foto_antes" || a.tipo === "foto_depois");
  const apoio = anexos.filter((a) => a.tipo === "documento");
  const assinatura = [...anexos].reverse().find((a) => a.tipo === "assinatura");

  // Link público do relatório (válido por 30 dias) para enviar aos parceiros.
  async function compartilhar(abrir: boolean) {
    const { data, error } = await supabase.from("os_relatorios_compartilhados").insert({ os_id: os.id }).select("token").single();
    if (error || !data) return alert(error?.message ?? "Não foi possível gerar o link.");
    const link = `${window.location.origin}/relatorio?t=${data.token}`;
    if (abrir) return window.open(link, "_blank");
    try {
      await navigator.clipboard.writeText(link);
      alert("Link do relatório copiado (válido por 30 dias):\n\n" + link);
    } catch {
      prompt("Copie o link do relatório (válido por 30 dias):", link);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={fechar}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-500">
              O.S. #{os.numero} · {os.tipo}
              {os.ticket_acionamento ? ` · ${os.ticket_interno ? "Token" : "Ticket"} ${os.ticket_acionamento}` : ""}
            </div>
            <h2 className="text-xl font-semibold">{os.titulo}</h2>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatus[os.status]}`}>{rotuloDaOs(os)}</span>
          <button className="rounded-md px-2 text-2xl leading-none text-gray-500 hover:bg-gray-100" onClick={fechar}>×</button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button className="rounded-lg bg-blue-700 px-3 py-1.5 font-medium text-white hover:bg-blue-800" onClick={() => compartilhar(false)}>
            Compartilhar relatório
          </button>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={() => compartilhar(true)}>
            Ver relatório / PDF
          </button>
          {encerrada || os.status === "concluida" ? (
            <button className="rounded-lg border border-amber-500 px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-50" onClick={() => setReabrir(true)}>
              Reabrir O.S.
            </button>
          ) : null}
          {!encerrada && (
            <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={() => setEditar(true)}>Editar dados</button>
          )}
          {EM_ANDAMENTO.includes(os.status) && (
            <button className="rounded-lg border border-red-400 px-3 py-1.5 font-medium text-red-800 hover:bg-red-50" onClick={voltarBacklog}>
              Voltar ao backlog
            </button>
          )}
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={() => setMaterial(true)}>📎 Material de apoio</button>
        </div>

        {encerrada && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            O.S. encerrada: para alterar, use <b>Reabrir O.S.</b>
          </p>
        )}
        {!encerrada && os.reaberta_em && os.reaberta_motivo && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Reaberta em {quando(os.reaberta_em)}: {os.reaberta_motivo}
          </p>
        )}

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Técnico</dt><dd>{os.tecnico?.nome ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Cadastro</dt><dd>{quando(os.criado_em)}</dd></div>
          <div><dt className="text-gray-500">Endereço / referência</dt><dd>{os.endereco ?? "—"}</dd></div>
          <div><dt className="text-gray-500">SLA (4h)</dt><dd>{quando(os.sla_limite)}</dd></div>
          {os.descricao && <div className="sm:col-span-2"><dt className="text-gray-500">Descrição</dt><dd className="whitespace-pre-wrap">{os.descricao}</dd></div>}
          {os.observacao_tecnico && <div className="sm:col-span-2"><dt className="text-gray-500">Observação do técnico</dt><dd className="whitespace-pre-wrap">{os.observacao_tecnico}</dd></div>}
          {os.observacao_supervisor && <div className="sm:col-span-2"><dt className="text-gray-500">Observação do supervisor</dt><dd className="whitespace-pre-wrap">{os.observacao_supervisor}</dd></div>}
          {local && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Local do evento</dt>
              <dd>
                Registrado em {quando(local.evento_localizado_em)}
                {local.evento_precisao_m != null ? ` (precisão ${Math.round(local.evento_precisao_m)} m)` : ""} ·{" "}
                <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?q=${local.latitude},${local.longitude}`}>
                  {local.latitude.toFixed(6)}, {local.longitude.toFixed(6)}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <ExecucaoOS osId={os.id} responsavelId={os.tecnico_id} bloqueado={encerrada} />

        {caixas.length > 0 && (
          <>
            <div className="mt-6 flex items-center gap-3">
              <h3 className="font-semibold">Caixas de emenda ({caixas.length})</h3>
              <button className="ml-auto rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
                onClick={() => baixarKmz(caixas, `Caixas-OS-${os.numero}`)}>Baixar KMZ das caixas</button>
            </div>
            {caixas.map((c) => (
              <details key={c.id} className="mt-2 rounded-lg border border-gray-200 p-3">
                <summary className="cursor-pointer font-medium">{c.identificacao}</summary>
                <div className="mt-2"><CaixaDetalhe caixa={c} /></div>
              </details>
            ))}
          </>
        )}

        <h3 className="mt-6 flex items-center gap-2 font-semibold">
          Fotos ({fotos.length})
          <span className="flex items-center gap-1 text-xs font-normal text-green-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-600" /> ao vivo
          </span>
        </h3>
        {fotos.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma foto enviada ainda. Elas aparecem aqui assim que chegam do celular.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <button key={f.id} onClick={() => setFoto(f)} className="group relative overflow-hidden rounded-lg border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover group-hover:opacity-90" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">
                  {i + 1} · {quando(f.tirada_em ?? f.criado_em)}
                </span>
              </button>
            ))}
          </div>
        )}

        {apoio.length > 0 && (
          <>
            <h3 className="mt-6 font-semibold">Material de apoio ({apoio.length})</h3>
            <ul className="mt-2 text-sm">
              {apoio.map((a) => (
                <li key={a.id}>
                  <a className="text-blue-700 hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.nome_arquivo ?? "arquivo"}</a>
                </li>
              ))}
            </ul>
          </>
        )}

        {assinatura && (
          <>
            <h3 className="mt-6 font-semibold">Assinatura do técnico</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assinatura.url} alt="Assinatura" className="mt-2 h-24 rounded border border-gray-200" />
            <p className="text-sm text-gray-600">{assinatura.descricao} · {quando(assinatura.tirada_em ?? assinatura.criado_em)}</p>
          </>
        )}

        <h3 className="mt-6 font-semibold">Histórico</h3>
        <ol className="mt-2 border-l-2 border-gray-200 pl-4 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="mb-2">
              <span className="font-medium">{rotuloStatus[e.status_novo]}</span>
              <span className="text-gray-500"> · {quando(e.criado_em)}{e.usuario?.nome ? ` · ${e.usuario.nome}` : ""}</span>
              {e.observacao && <div className="text-amber-800">{e.observacao}</div>}
            </li>
          ))}
        </ol>
      </div>

      {reabrir && <ReabrirOS os={os} fechar={() => setReabrir(false)} reaberta={recarregar} />}
      {editar && <EditarOS os={os} fechar={() => setEditar(false)} salva={recarregar} />}
      {material && <div onClick={(e) => e.stopPropagation()}><MaterialApoio osId={os.id} numero={os.numero} fechar={() => { setMaterial(false); recarregar(); }} /></div>}
      {foto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/90 p-4" onClick={(e) => { e.stopPropagation(); setFoto(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
          <a href={foto.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium">Abrir original</a>
        </div>
      )}
    </div>
  );
}
