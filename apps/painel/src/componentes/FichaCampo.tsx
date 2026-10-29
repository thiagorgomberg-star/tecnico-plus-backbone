"use client";

import { useEffect, useState } from "react";

import { baixarXlsxAbas } from "@/lib/planilha";
import { supabase } from "@/lib/supabase";
import { rotuloStatus, StatusOS } from "@/lib/tipos";
import { duracao, fmtKm, kmPercorridos, paradas, type PontoGps } from "@/lib/trajeto";

type Os = { id: string; numero: number; titulo: string; tipo: string; status: StatusOS; enviada_em: string | null; iniciada_em: string | null; concluida_em: string | null; endereco: string | null };
type Dados = {
  pessoa: { telefone: string | null; cargo: string | null; classe_equipe: string | null } | null;
  posicao: { latitude: number | null; longitude: number | null; registrado_em: string; velocidade_kmh: number | null; bateria_pct: number | null } | null;
  expedientes: { inicio: string; fim: string | null; km_inicial: number | null; km_final: number | null; encerrado_motivo: string | null; distancia_gps_km: number | null }[];
  refeicoes: { inicio: string; fim: string | null }[];
  veiculo: { placa: string; marca: string | null; modelo: string | null; cor: string | null; odometro_km: number | null } | null;
  carro: { matricula: string; datahora: string | null; ignicao: boolean | null; velocidade_kmh: number | null; rua: string | null; latitude: number | null; longitude: number | null } | null;
  ordens: Os[];
  pontos: PontoGps[];
  escala: { tipo: string; observacao: string | null }[];
};
const ESCALA: Record<string, string> = {
  folga_programada: "Folga programada", folga_interjornada: "Folga interjornada", manutencao_carro: "Manutenção do carro",
  plantao: "Plantão", sobreaviso: "Sobreaviso", ferias: "Férias", atestado: "Atestado", outro: "Outro",
};

const ABERTAS: StatusOS[] = ["enviada", "aceita", "em_execucao", "pausada", "devolvida"];
const hm = (s: string | null) => (s ? new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
const hoje = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const minutosDesde = (s: string) => Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000));

// Ficha do técnico no console: onde está, se está com O.S., bateria, carro, o que fez no dia e exportação.
export default function FichaCampo({ tecnico, dia, fechar, verNoMapa, abrirOs }: {
  tecnico: { id: string; nome: string }; dia: string; fechar: () => void;
  verNoMapa: (lon: number, lat: number) => void; abrirOs: (id: string) => void;
}) {
  const [d, setD] = useState<Dados | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const ini = new Date(`${dia}T00:00:00`).toISOString();
    const fim = new Date(new Date(`${dia}T00:00:00`).getTime() + 86400000).toISOString();
    const id = tecnico.id;
    Promise.all([
      supabase.from("usuarios").select("telefone, cargo, classe_equipe").eq("id", id).maybeSingle(),
      supabase.from("posicao_atual_tecnicos").select("latitude, longitude, registrado_em, velocidade_kmh, bateria_pct").eq("tecnico_id", id).maybeSingle(),
      supabase.from("expedientes").select("id, inicio, fim, km_inicial, km_final, encerrado_motivo, distancia_gps_km").eq("tecnico_id", id).lt("inicio", fim).or(`fim.is.null,fim.gt.${ini}`).order("inicio"),
      supabase.from("refeicoes").select("inicio, fim").eq("tecnico_id", id).lt("inicio", fim).or(`fim.is.null,fim.gt.${ini}`).order("inicio"),
      supabase.from("veiculos").select("id, placa, marca, modelo, cor, odometro_km").eq("tecnico_id", id).eq("ativo", true).limit(1).maybeSingle(),
      supabase.from("ordens_servico").select("id, numero, titulo, tipo, status, enviada_em, iniciada_em, concluida_em, endereco").eq("tecnico_id", id)
        .or(`status.in.(${ABERTAS.join(",")}),and(concluida_em.gte.${ini},concluida_em.lt.${fim}),and(iniciada_em.gte.${ini},iniciada_em.lt.${fim})`).order("numero"),
      supabase.from("escala").select("tipo, observacao").eq("tecnico_id", id).eq("data", dia).neq("tipo", "jornada"),
    ]).then(async ([pessoa, pos, exp, ref, vei, os, esc]) => {
      const expIds = (exp.data ?? []).map((e) => e.id);
      const [carro, gps] = await Promise.all([
        vei.data ? supabase.from("geocar_viaturas").select("matricula, datahora, ignicao, velocidade_kmh, rua, latitude, longitude").eq("veiculo_id", vei.data.id).maybeSingle() : Promise.resolve({ data: null }),
        // Trajeto ponto a ponto só existe para hoje (view trajeto_do_dia); outros dias usam o km gravado no expediente.
        expIds.length && dia === hoje() ? supabase.from("trajeto_do_dia").select("registrado_em, latitude, longitude, precisao_m").eq("tecnico_id", id)
          .order("registrado_em").limit(20000) : Promise.resolve({ data: [] }),
      ]);
      setD({
        pessoa: pessoa.data, posicao: pos.data, expedientes: exp.data ?? [], refeicoes: ref.data ?? [], veiculo: vei.data,
        carro: carro.data, ordens: (os.data as Os[]) ?? [], pontos: (gps.data as PontoGps[]) ?? [], escala: esc.data ?? [],
      });
    });
  }, [tecnico.id, dia, versao]);

  async function encerrarExpediente() {
    const motivo = prompt(`Encerrar agora o expediente de ${tecnico.nome}?\nO app dele para o GPS e recebe um aviso. As O.S. abertas continuam com ele.\n\nMotivo (obrigatório):`)?.trim();
    if (!motivo) return;
    const { data, error } = await supabase.rpc("encerrar_expediente_remoto", { p_tecnico: tecnico.id, p_motivo: motivo });
    if (error) return alert(error.message);
    alert(data ? "Expediente encerrado." : "Ele não tinha expediente aberto.");
    setVersao((v) => v + 1);
  }

  const emExpediente = d?.expedientes.some((e) => !e.fim);
  const emRefeicao = d?.refeicoes.some((r) => !r.fim);
  const emExecucao = d?.ordens.find((o) => o.status === "em_execucao");
  const abertas = d?.ordens.filter((o) => ABERTAS.includes(o.status)) ?? [];
  const concluidas = d?.ordens.filter((o) => o.concluida_em && o.concluida_em.slice(0, 10) >= dia) ?? [];
  const km = !d ? 0 : d.pontos.length ? kmPercorridos(d.pontos) : d.expedientes.reduce((t, e) => t + Number(e.distancia_gps_km ?? 0), 0);
  const pars = d ? paradas(d.pontos) : [];
  const situacao = !d ? "" : emRefeicao ? "Em refeição" : emExecucao ? `Executando a O.S. #${emExecucao.numero}` : abertas.length ? `Com ${abertas.length} O.S. em aberto, nenhuma em execução` : "Sem O.S.";

  async function exportar() {
    if (!d) return;
    await baixarXlsxAbas(`Tecnico-${tecnico.nome.split(" ")[0]}-${dia}.xlsx`, [
      { nome: "Resumo", cabecalho: ["Campo", "Valor"], linhas: [
        ["Técnico", tecnico.nome], ["Dia", dia], ["Situação agora", situacao],
        ["Escala do dia", d.escala.map((e) => ESCALA[e.tipo] ?? e.tipo).join(", ") || "—"],
        ["Expediente", d.expedientes.map((e) => `${hm(e.inicio)}–${e.fim ? hm(e.fim) : "em andamento"}`).join(", ") || "não iniciou"],
        ["Refeição", d.refeicoes.map((r) => `${hm(r.inicio)}–${r.fim ? hm(r.fim) : "em andamento"}`).join(", ") || "—"],
        ["km pelo GPS do celular", Number(km.toFixed(1))], ["Paradas (10 min ou mais)", pars.length],
        ["Veículo", d.veiculo ? [d.veiculo.placa, d.veiculo.marca, d.veiculo.modelo].filter(Boolean).join(" ") : "—"],
        ["km inicial / final", d.expedientes.map((e) => `${e.km_inicial ?? "—"} / ${e.km_final ?? "—"}`).join(", ") || "—"],
        ["Bateria do celular", d.posicao?.bateria_pct != null ? `${d.posicao.bateria_pct}%` : "—"],
        ["O.S. concluídas no dia", concluidas.length], ["O.S. em aberto", abertas.length],
      ] },
      { nome: "O.S.", cabecalho: ["Número", "Tipo", "Título", "Status", "Endereço", "Enviada", "Iniciada", "Concluída"],
        linhas: d.ordens.map((o) => [o.numero, o.tipo, o.titulo, rotuloStatus[o.status], o.endereco,
          o.enviada_em ? new Date(o.enviada_em) : null, o.iniciada_em ? new Date(o.iniciada_em) : null, o.concluida_em ? new Date(o.concluida_em) : null]) },
      { nome: "Paradas", cabecalho: ["Início", "Fim", "Minutos", "Latitude", "Longitude", "Mapa"],
        linhas: pars.map((p) => [new Date(p.inicio), new Date(p.fim), p.minutos, p.latitude, p.longitude,
          { texto: "Abrir", url: `https://www.google.com/maps?q=${p.latitude},${p.longitude}` }]) },
    ]);
  }

  const linha = "flex justify-between gap-3 border-b border-gray-100 py-1.5";
  const pos = d?.posicao;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={fechar}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{tecnico.nome}</h2>
            <p className="text-sm text-gray-500">{[d?.pessoa?.cargo, d?.pessoa?.classe_equipe ? `Equipe classe ${d.pessoa.classe_equipe}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <button className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100" onClick={fechar} aria-label="Fechar">✕</button>
        </div>
        {!d ? <p className="mt-6 text-sm text-gray-500">Carregando...</p> : (
          <>
            <div className={`mt-3 rounded-lg p-3 text-sm font-semibold ${emExecucao ? "bg-green-50 text-green-800" : abertas.length ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700"}`}>
              {emExpediente ? "Em expediente" : "Fora do expediente"} · {situacao}
            </div>
            {d.escala.length > 0 && (
              <div className="mt-2 rounded-lg bg-orange-50 p-2 text-sm text-orange-900">
                Escala do dia: <b>{d.escala.map((e) => ESCALA[e.tipo] ?? e.tipo).join(", ")}</b>
                {d.escala.some((e) => e.observacao) && <span className="block text-xs">{d.escala.map((e) => e.observacao).filter(Boolean).join(" · ")}</span>}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {pos?.latitude != null && pos.longitude != null && (
                <>
                  <button className="rounded-lg bg-blue-700 px-3 py-1.5 font-semibold text-white hover:bg-blue-800" onClick={() => verNoMapa(pos.longitude!, pos.latitude!)}>Ver no mapa</button>
                  <a className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pos.latitude},${pos.longitude}`}>Navegar até ele</a>
                </>
              )}
              {d.pessoa?.telefone && (
                <a className="rounded-lg border border-green-600 px-3 py-1.5 text-green-700 hover:bg-green-50" target="_blank" rel="noreferrer"
                  href={`https://wa.me/55${d.pessoa.telefone.replace(/\D/g, "").replace(/^55/, "")}`}>WhatsApp</a>
              )}
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50" onClick={exportar}>⬇ Exportar relatório do dia (Excel)</button>
              {emExpediente && (
                <button className="rounded-lg border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50" onClick={encerrarExpediente}>⏻ Encerrar expediente</button>
              )}
            </div>

            <h3 className="mt-4 text-sm font-semibold text-gray-700">Celular</h3>
            <dl className="text-sm">
              <div className={linha}><dt className="text-gray-500">Último sinal</dt><dd className={pos && minutosDesde(pos.registrado_em) > 15 ? "text-red-700" : ""}>
                {pos ? `${hm(pos.registrado_em)} (há ${duracao(minutosDesde(pos.registrado_em))})` : "sem sinal hoje"}</dd></div>
              <div className={linha}><dt className="text-gray-500">Bateria</dt><dd className={pos?.bateria_pct != null && pos.bateria_pct <= 20 ? "font-semibold text-red-700" : ""}>
                {pos?.bateria_pct != null ? `${pos.bateria_pct}%` : "—"}</dd></div>
              <div className={linha}><dt className="text-gray-500">Velocidade</dt><dd>{pos?.velocidade_kmh != null && pos.velocidade_kmh > 3 ? `${Math.round(pos.velocidade_kmh)} km/h` : "parado"}</dd></div>
              <div className={linha}><dt className="text-gray-500">Expediente</dt><dd>{d.expedientes.map((e) => `${hm(e.inicio)}–${e.fim ? hm(e.fim) : "agora"}`).join(", ") || "não iniciou"}</dd></div>
              {d.expedientes.some((e) => e.encerrado_motivo) && (
                <div className={linha}><dt className="text-gray-500">Encerrado pelo supervisor</dt><dd>{d.expedientes.map((e) => e.encerrado_motivo).filter(Boolean).join("; ")}</dd></div>
              )}
              <div className={linha}><dt className="text-gray-500">Refeição</dt><dd>{d.refeicoes.map((r) => `${hm(r.inicio)}–${r.fim ? hm(r.fim) : "agora"}`).join(", ") || "—"}</dd></div>
              <div className={linha}><dt className="text-gray-500">Percorrido (GPS)</dt><dd><b>{fmtKm(km)}</b> · {pars.length} parada(s)</dd></div>
            </dl>

            <h3 className="mt-4 text-sm font-semibold text-gray-700">Carro</h3>
            {!d.veiculo ? <p className="text-sm text-gray-500">Nenhum veículo vinculado na Frota.</p> : (
              <dl className="text-sm">
                <div className={linha}><dt className="text-gray-500">Veículo</dt><dd>{[d.veiculo.placa, d.veiculo.marca, d.veiculo.modelo, d.veiculo.cor].filter(Boolean).join(" · ")}</dd></div>
                <div className={linha}><dt className="text-gray-500">km inicial / final</dt><dd>{d.expedientes.map((e) => `${e.km_inicial ?? "—"} / ${e.km_final ?? "—"}`).join(", ") || "—"}</dd></div>
                {d.carro ? (
                  <>
                    <div className={linha}><dt className="text-gray-500">GEOCAR</dt><dd>{d.carro.ignicao == null ? "—" : d.carro.ignicao ? "Ligado" : "Desligado"}
                      {d.carro.velocidade_kmh ? ` · ${d.carro.velocidade_kmh} km/h` : ""}{d.carro.datahora ? ` · ${hm(d.carro.datahora)}` : ""}</dd></div>
                    {d.carro.rua && <div className={linha}><dt className="text-gray-500">Rua</dt><dd className="text-right">{d.carro.rua}</dd></div>}
                  </>
                ) : <p className="py-1.5 text-xs text-gray-500">Carro sem rastreador GEOCAR vinculado.</p>}
              </dl>
            )}

            <h3 className="mt-4 text-sm font-semibold text-gray-700">Atividades ({d.ordens.length})</h3>
            {!d.ordens.length ? <p className="text-sm text-gray-500">Nenhuma O.S. hoje.</p> : (
              <ul className="text-sm">
                {d.ordens.map((o) => (
                  <li key={o.id}>
                    <button className="w-full border-b border-gray-100 py-2 text-left hover:bg-gray-50" onClick={() => abrirOs(o.id)}>
                      <span className="font-medium">#{o.numero} · {o.titulo}</span>
                      <span className="block text-xs text-gray-500">
                        {rotuloStatus[o.status]} · {o.tipo}{o.iniciada_em ? ` · início ${hm(o.iniciada_em)}` : ""}{o.concluida_em ? ` · fim ${hm(o.concluida_em)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
