"use client";

import { useCallback, useEffect, useState } from "react";

import CaixaDetalhe, { CaixaPainel } from "@/componentes/CaixaDetalhe";
import { baixarKmz } from "@/componentes/CaixasRede";
import EditarOS from "@/componentes/EditarOS";
import EditorClientesOS from "@/componentes/EditorClientesOS";
import MapaOS from "@/componentes/MapaOS";
import OkCliente from "@/componentes/OkCliente";
import MaterialApoio from "@/componentes/MaterialApoio";
import ProgramarOS from "@/componentes/ProgramarOS";
import ExecucaoOS from "@/componentes/ExecucaoOS";
import ReabrirOS from "@/componentes/ReabrirOS";
import { Cliente, ClienteOS, clientesDaOS, fmtSla, listarClientes, salvarClientesOS } from "@/lib/clientes";
import { baixarBookFotos } from "@/lib/bookFotos";
import { encerrarPeloSupervisor } from "@/lib/encerrarOS";
import { supabase } from "@/lib/supabase";
import { corStatus, ENCERRADAS, OrdemServico, rotuloDaOs, rotuloStatus, StatusOS } from "@/lib/tipos";

const EM_ANDAMENTO: StatusOS[] = ["enviada", "aceita", "em_execucao", "pausada", "devolvida"];

type Anexo = {
  id: string; tipo: string; caminho_arquivo: string; nome_arquivo: string | null; descricao: string | null;
  tirada_em: string | null; criado_em: string; oculta_relatorio: boolean; url?: string;
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
  const [programar, setProgramar] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [local, setLocal] = useState<Local | null>(null);
  const [ponto, setPonto] = useState<{ latitude: number; longitude: number; do_evento: boolean } | null | undefined>(undefined);
  const [foto, setFoto] = useState<Anexo | null>(null);
  const [caixas, setCaixas] = useState<CaixaPainel[]>([]);
  const [reabrir, setReabrir] = useState(false);
  const [editar, setEditar] = useState(false);
  const [versao, setVersao] = useState(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [linhasClientes, setLinhasClientes] = useState<ClienteOS[]>([]);
  const [editandoClientes, setEditandoClientes] = useState<ClienteOS[] | null>(null);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("ordens_servico").select("*, tecnico:usuarios!ordens_servico_tecnico_id_fkey(nome)").eq("id", inicial.id).single()
      .then(({ data }) => data && setOs(data as OrdemServico));
    supabase.from("os_eventos").select("id, status_anterior, status_novo, criado_em, observacao, usuario:usuarios(nome)")
      .eq("os_id", inicial.id).order("criado_em")
      .then(({ data }) => setEventos((data as unknown as Evento[]) ?? []));
    listarClientes().then(setClientes);
    clientesDaOS(inicial.id).then(setLinhasClientes);
    supabase.from("eventos_mapa").select("latitude, longitude, evento_localizado_em, evento_precisao_m").eq("id", inicial.id).maybeSingle()
      .then(({ data }) => setLocal(data));
    supabase.from("os_local_mapa").select("latitude, longitude, do_evento").eq("id", inicial.id).maybeSingle()
      .then(({ data }) => setPonto(data ?? null));
    supabase.from("caixas_mapa").select("*").eq("os_id", inicial.id).order("localizada_em")
      .then(({ data }) => setCaixas((data as unknown as CaixaPainel[]) ?? []));
    supabase.from("os_anexos").select("id, tipo, caminho_arquivo, nome_arquivo, descricao, tirada_em, criado_em, oculta_relatorio")
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

  async function gravarClientes() {
    if (!editandoClientes) return;
    try {
      await salvarClientesOS(os.id, editandoClientes);
      setEditandoClientes(null);
      recarregar();
    } catch (e) {
      alert(`Não foi possível gravar os clientes: ${(e as Error).message}`);
    }
  }
  const nomeCliente = (id: string) => clientes.find((c) => c.id === id);

  // Supervisor tira a O.S. do técnico (e do apoio) e devolve ao backlog geral, com motivo.
  async function voltarBacklog() {
    const motivo = prompt(`Voltar a O.S. #${os.numero} ao backlog?\nEla sai do técnico e qualquer técnico poderá assumir.\n\nMotivo (obrigatório):`)?.trim();
    if (!motivo) return;
    const { error } = await supabase.rpc("voltar_para_backlog", { p_os: os.id, p_motivo: motivo });
    if (error) return alert(error.message);
    await supabase.from("os_tecnicos_apoio").delete().eq("os_id", os.id);
    fechar();
  }
  const [baixandoBook, setBaixandoBook] = useState("");
  const fotos = anexos.filter((a) => a.tipo === "foto_antes" || a.tipo === "foto_depois");

  // Navegar entre as fotos da O.S. no visualizador (setas na tela e no teclado; Esc fecha).
  const posFoto = foto ? Math.max(0, fotos.findIndex((f) => f.id === foto.id)) : 0;
  const andarFoto = useCallback((passo: number) => {
    if (!fotos.length) return;
    setFoto((atual) => {
      const i = atual ? fotos.findIndex((f) => f.id === atual.id) : 0;
      return fotos[(i + passo + fotos.length) % fotos.length];
    });
  }, [fotos]);
  useEffect(() => {
    if (!foto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") andarFoto(1);
      else if (e.key === "ArrowLeft") andarFoto(-1);
      else if (e.key === "Escape") setFoto(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [foto, andarFoto]);
  // Supervisor esconde (ou volta a mostrar) uma foto no relatório; ela continua guardada na O.S.
  // Legenda (balão abaixo da foto no relatório): o supervisor também pode escrever ou corrigir.
  async function editarLegenda(f: Anexo) {
    const texto = window.prompt("Legenda da foto (aparece abaixo dela no relatório). Deixe vazio para tirar.", f.descricao ?? "");
    if (texto === null) return;
    const { error } = await supabase.rpc("legendar_foto_os", { p_caminho: f.caminho_arquivo, p_legenda: texto });
    if (error) return alert(`Não foi possível salvar a legenda: ${error.message}`);
    const nova = texto.trim() || null;
    setAnexos((v) => v.map((a) => (a.id === f.id ? { ...a, descricao: nova } : a)));
    setFoto((atual) => (atual?.id === f.id ? { ...atual, descricao: nova } : atual));
  }

  async function alternarOculta(f: Anexo) {
    const { error } = await supabase.from("os_anexos").update({ oculta_relatorio: !f.oculta_relatorio }).eq("id", f.id);
    if (error) return alert(error.message);
    setAnexos((v) => v.map((a) => (a.id === f.id ? { ...a, oculta_relatorio: !f.oculta_relatorio } : a)));
    setFoto((atual) => (atual?.id === f.id ? { ...atual, oculta_relatorio: !f.oculta_relatorio } : atual));
  }

  // Supervisor envia fotos do computador para a O.S. Foto em pé ganha faixas laterais para ficar deitada (padrão do relatório).
  const [tipoEnvio, setTipoEnvio] = useState<"foto_antes" | "foto_depois">("foto_depois");
  const [enviando, setEnviando] = useState(0);
  async function enviarFotos(arquivos: FileList | null) {
    const lista = Array.from(arquivos ?? []).filter((a) => a.type.startsWith("image/"));
    if (!lista.length) return;
    setEnviando(lista.length);
    for (const arquivo of lista) {
      try {
        const { blob, largura, altura } = await fotoDeitada(arquivo);
        const caminho = `${os.id}/supervisor/${crypto.randomUUID()}.jpg`;
        const { error: e1 } = await supabase.storage.from("os-anexos").upload(caminho, blob, { contentType: "image/jpeg" });
        if (e1) throw e1;
        const { data: sessao } = await supabase.auth.getUser();
        const { error: e2 } = await supabase.from("os_anexos").insert({
          os_id: os.id, tipo: tipoEnvio, caminho_arquivo: caminho, nome_arquivo: arquivo.name, enviado_por: sessao.user?.id,
          largura_px: largura, altura_px: altura, tirada_em: new Date(arquivo.lastModified || Date.now()).toISOString(),
        });
        if (e2) throw e2;
      } catch (e) {
        alert(`Não foi possível enviar ${arquivo.name}: ${(e as { message?: string }).message ?? e}`);
      }
      setEnviando((n) => n - 1);
    }
    recarregar();
  }
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
          {["enviada", "aceita", "em_execucao", "pausada", "devolvida"].includes(os.status) && os.tecnico_id && (
            <button className="rounded-lg border border-green-600 px-3 py-1.5 font-medium text-green-800 hover:bg-green-50"
              title="Concluir pelo supervisor, sem o técnico" onClick={async () => (await encerrarPeloSupervisor(os)) && recarregar()}>
              Encerrar O.S. (supervisor)
            </button>
          )}
          {EM_ANDAMENTO.includes(os.status) && (
            <button className="rounded-lg border border-red-400 px-3 py-1.5 font-medium text-red-800 hover:bg-red-50" onClick={voltarBacklog}>
              Voltar ao backlog
            </button>
          )}
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={() => setMaterial(true)}>📎 Material de apoio</button>
          {os.status === "rascunho" && (
            <button className="rounded-lg border border-blue-400 px-3 py-1.5 font-medium text-blue-800 hover:bg-blue-50" onClick={() => setProgramar(true)}>
              📅 {os.programada_inicio ? `Programada ${new Date(os.programada_inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Programar dia"}
            </button>
          )}
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
          <div className="sm:col-span-2">
            <dt className="flex items-center gap-3 text-gray-500">
              Clientes do evento
              {linhasClientes.length > 1 && (() => {
                const ok = linhasClientes.filter((l) => l.restabelecido_em).length;
                return ok > 0 ? <span className={`rounded px-1.5 text-xs font-semibold ${ok === linhasClientes.length ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {ok === linhasClientes.length ? "Todos os clientes deram OK" : `Baixa parcial: ${ok} de ${linhasClientes.length} clientes OK`}</span> : null;
              })()}
              {!encerrada && !editandoClientes && (
                <button className="text-xs text-blue-700 hover:underline" onClick={() => setEditandoClientes(linhasClientes.length ? linhasClientes : [{ cliente_id: "", ticket: "", texto_acionamento: "" }])}>
                  {linhasClientes.length ? "Editar clientes" : "+ Adicionar cliente"}
                </button>
              )}
            </dt>
            <dd>
              {editandoClientes ? (
                <div className="mt-1">
                  <EditorClientesOS clientes={clientes} linhas={editandoClientes} mudar={setEditandoClientes} />
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-lg bg-[#163A6B] px-3 py-1.5 text-white hover:opacity-90" onClick={gravarClientes}>Salvar clientes</button>
                    <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={() => setEditandoClientes(null)}>Cancelar</button>
                  </div>
                </div>
              ) : linhasClientes.length === 0 ? "—" : (
                <ul className="mt-1 grid gap-2">
                  {linhasClientes.map((l) => {
                    const c = nomeCliente(l.cliente_id);
                    return (
                      <li key={l.id} className="rounded-lg border border-gray-200 p-2">
                        <b>{c?.nome ?? "Cliente"}</b>
                        {c ? <span className="text-gray-500"> · SLA {fmtSla(c.sla_horas)}</span> : null}
                        {l.ticket ? <span> · Ticket <b>{l.ticket}</b></span> : null}
                        {l.texto_acionamento ? <p className="mt-1 whitespace-pre-wrap text-gray-700">{l.texto_acionamento}</p> : null}
                        <OkCliente linha={l} podeEditar={os.status !== "cancelada"} mudou={(nova) => setLinhasClientes((v) => v.map((x) => (x.id === nova.id ? nova : x)))} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </dd>
          </div>
          <div><dt className="text-gray-500">Técnico</dt><dd>{os.tecnico?.nome ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Cadastro</dt><dd>{quando(os.criado_em)}</dd></div>
          <div><dt className="text-gray-500">Endereço / referência</dt><dd>{os.endereco ?? "—"}</dd></div>
          <div><dt className="text-gray-500">SLA{linhasClientes.length ? " (menor entre os clientes)" : " (4h)"}</dt><dd>{quando(os.sla_limite)}</dd></div>
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
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Mapa</dt>
            <dd>{ponto !== undefined && <MapaOS latitude={ponto?.latitude} longitude={ponto?.longitude} doEvento={ponto?.do_evento} endereco={os.endereco} />}</dd>
          </div>
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
          {fotos.length > 0 && (
            <button className="ml-auto rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              disabled={!!baixandoBook} title="Baixa um .zip com todas as fotos da O.S. (antes, depois e das caixas), já com a máscara"
              onClick={async () => {
                try {
                  const n = await baixarBookFotos(os, setBaixandoBook);
                  if (!n) alert("Nenhuma foto para baixar.");
                } catch (e) { alert(`Não deu para gerar o book: ${(e as Error).message}`); }
                setBaixandoBook("");
              }}>
              {baixandoBook ? `Preparando ${baixandoBook}...` : "⬇ Baixar book de fotos (.zip)"}
            </button>
          )}
        </h3>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Tipo da foto</span>
            <select className="rounded border border-gray-300 bg-white px-2 py-1.5" value={tipoEnvio}
              onChange={(e) => setTipoEnvio(e.target.value as "foto_antes" | "foto_depois")}>
              <option value="foto_antes">Antes</option>
              <option value="foto_depois">Depois</option>
            </select>
          </label>
          <label className={`cursor-pointer rounded-lg bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800 ${enviando ? "pointer-events-none opacity-60" : ""}`}>
            {enviando ? `Enviando... (${enviando})` : "📷 Enviar fotos para a O.S."}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { enviarFotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {fotos.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma foto enviada ainda. Elas aparecem aqui assim que chegam do celular.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <div key={f.id} className={`group relative overflow-hidden rounded-lg border ${f.oculta_relatorio ? "border-amber-400" : "border-gray-200"}`}>
                <button onClick={() => setFoto(f)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${i + 1}`} className={`aspect-[4/3] w-full object-cover group-hover:opacity-90 ${f.oculta_relatorio ? "opacity-40" : ""}`} />
                </button>
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">
                  {i + 1} · {quando(f.tirada_em ?? f.criado_em)}
                </span>
                {f.oculta_relatorio && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-amber-500 px-1.5 text-xs font-medium text-white">Fora do relatório</span>
                )}
                <button onClick={() => alternarOculta(f)} title={f.oculta_relatorio ? "Mostrar no relatório" : "Ocultar do relatório"}
                  className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-gray-800 shadow hover:bg-white">
                  {f.oculta_relatorio ? "👁 Mostrar" : "🙈 Ocultar"}
                </button>
                <button onClick={() => editarLegenda(f)} title="Escrever ou corrigir a legenda"
                  className={`block w-full px-2 py-1 text-left text-xs ${f.descricao ? "bg-blue-50 text-gray-900" : "text-blue-700 hover:bg-gray-50"}`}>
                  {f.descricao ? `💬 ${f.descricao}` : "+ Legenda"}
                </button>
              </div>
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
      {programar && <div onClick={(e) => e.stopPropagation()}><ProgramarOS os={os} fechar={() => setProgramar(false)} salva={recarregar} /></div>}
      {material && <div onClick={(e) => e.stopPropagation()}><MaterialApoio osId={os.id} numero={os.numero} fechar={() => { setMaterial(false); recarregar(); }} /></div>}
      {foto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/90 p-4" onClick={(e) => { e.stopPropagation(); setFoto(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
          <span className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white">
            Foto {posFoto + 1} de {fotos.length} · {quando(foto.tirada_em ?? foto.criado_em)}
          </span>
          <a href={foto.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium">Abrir original</a>
          <button onClick={(e) => { e.stopPropagation(); alternarOculta(foto); }}
            className={`absolute right-40 top-4 rounded-lg px-3 py-1.5 text-sm font-medium ${foto.oculta_relatorio ? "bg-amber-500 text-white" : "bg-white text-gray-900"}`}>
            {foto.oculta_relatorio ? "👁 Mostrar no relatório" : "🙈 Ocultar do relatório"}
          </button>
          <button onClick={(e) => { e.stopPropagation(); editarLegenda(foto); }}
            className="absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 rounded-xl bg-white px-4 py-2 text-sm text-gray-900 shadow">
            {foto.descricao ? `💬 ${foto.descricao}` : "+ Legenda"}
          </button>
          {fotos.length > 1 && (
            <>
              <button aria-label="Foto anterior" onClick={(e) => { e.stopPropagation(); andarFoto(-1); }}
                className="absolute left-3 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-3xl text-gray-900 hover:bg-white">‹</button>
              <button aria-label="Próxima foto" onClick={(e) => { e.stopPropagation(); andarFoto(1); }}
                className="absolute right-3 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-3xl text-gray-900 hover:bg-white">›</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Lê a imagem e devolve um JPEG deitado: foto em pé ou quadrada ganha faixas pretas nas laterais (nada é cortado).
async function fotoDeitada(arquivo: File): Promise<{ blob: Blob; largura: number; altura: number }> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 2560 / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const largura = w > h ? w : Math.round(h * 4 / 3);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, largura, h);
  ctx.drawImage(img, Math.round((largura - w) / 2), 0, w, h);
  const blob = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("imagem inválida"))), "image/jpeg", 0.88));
  return { blob, largura, altura: h };
}
