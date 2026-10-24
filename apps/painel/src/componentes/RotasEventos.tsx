"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Rota = { id: string; trecho: string; descricao: string | null; link_kmz: string; ativo: boolean };
type Curva = {
  rota_id: string; origem: "arquivo" | "campo"; tirada_em: string; bucket: string; caminho: string; nome: string;
  fibra: number | null; ponta: string | null; observacao: string | null; os_numero: number | null; enviado_por: string | null;
  total: number; ultima_em: string;
};

export const DIAS_CURVA = 30;
const diasDesde = (iso: string) => Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
type Evento = {
  id: string;
  numero: number;
  ticket_acionamento: string | null;
  tipo: string;
  titulo: string;
  status: string;
  evento_localizado_em: string;
  latitude: number;
  longitude: number;
  evento_precisao_m: number | null;
  tecnico: string | null;
};

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// KML com um pin por evento, para abrir no Google Earth e atualizar o KMZ oficial.
function gerarKml(eventos: Evento[]) {
  const pins = eventos.map((e) => {
    const quando = new Date(e.evento_localizado_em).toLocaleString("pt-BR");
    const detalhes = [
      `O.S. ${e.numero}`,
      e.ticket_acionamento ? `Ticket ${e.ticket_acionamento}` : null,
      e.tipo,
      `Localizado em ${quando}`,
      e.tecnico ? `Técnico: ${e.tecnico}` : null,
      e.evento_precisao_m != null ? `Precisão: ${Math.round(e.evento_precisao_m)} m` : null,
    ].filter(Boolean).join("\n");
    return `    <Placemark>
      <name>${escapar(`O.S. ${e.numero} - ${e.titulo}`)}</name>
      <description>${escapar(detalhes)}</description>
      <TimeStamp><when>${e.evento_localizado_em}</when></TimeStamp>
      <Point><coordinates>${e.longitude},${e.latitude},0</coordinates></Point>
    </Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Eventos atendidos - Técnico Plus</name>
${pins.join("\n")}
  </Document>
</kml>
`;
}

export default function RotasEventos() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [trecho, setTrecho] = useState("");
  const [link, setLink] = useState("");
  const [descricao, setDescricao] = useState("");
  const [curvas, setCurvas] = useState<Curva[]>([]);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("rotas").select("*").order("trecho").then(({ data }) => setRotas(data ?? []));
    supabase.rpc("curvas_trecho", { p_limite: 10 }).then(({ data }) => setCurvas((data as Curva[]) ?? []));
    supabase.from("eventos_mapa").select("*").order("evento_localizado_em", { ascending: false })
      .then(({ data }) => setEventos(data ?? []));
  }, [versao]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("rotas").insert({ trecho: trecho.trim(), link_kmz: link.trim(), descricao: descricao.trim() || null });
    if (error) return alert(error.message);
    setTrecho(""); setLink(""); setDescricao("");
    recarregar();
  }

  async function alternar(r: Rota) {
    const { error } = await supabase.from("rotas").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return alert(error.message);
    recarregar();
  }

  function baixarKml() {
    const blob = new Blob([gerarKml(eventos)], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-tecnico-plus-${new Date().toISOString().slice(0, 10)}.kml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campo = "rounded-lg border border-gray-300 p-2";
  const curvasDe = (id: string) => curvas.filter((c) => c.rota_id === id);
  const atrasados = rotas.filter((r) => r.ativo).filter((r) => {
    const c = curvasDe(r.id)[0];
    return !c || diasDesde(c.ultima_em) > DIAS_CURVA;
  });

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 p-4 font-semibold">Rotas do backbone (KMZ e curvas OTDR por trecho)</h2>
        {atrasados.length > 0 && (
          <div className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-800">
            ⚠ {atrasados.length} trecho(s) há mais de {DIAS_CURVA} dias sem curva nova: {atrasados.map((r) => r.trecho).join(", ")}
          </div>
        )}
        <form onSubmit={adicionar} className="grid gap-2 border-b border-gray-100 p-4 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <input className={campo} placeholder="Trecho (ex.: Arujá - Guararema)" value={trecho} onChange={(e) => setTrecho(e.target.value)} required />
          <input className={campo} placeholder="Link do KMZ no Google Drive" type="url" value={link} onChange={(e) => setLink(e.target.value)} required />
          <input className={campo} placeholder="Observação (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">Adicionar</button>
        </form>
        {rotas.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Nenhum trecho cadastrado.</p>
        ) : (
          <ul>
            {rotas.map((r) => (
              <TrechoCurvas key={r.id} rota={r} curvas={curvasDe(r.id)} alternar={() => alternar(r)} recarregar={recarregar} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
          <h2 className="font-semibold">Eventos localizados em campo ({eventos.length})</h2>
          <button className="ml-auto rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
            disabled={eventos.length === 0} onClick={baixarKml}>
            Exportar pins (KML para Google Earth)
          </button>
        </div>
        {eventos.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Nenhum evento com localização ainda.</p>
        ) : (
          <ul>
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 text-sm last:border-0">
                <span className="font-mono">#{e.numero}</span>
                <span className="font-medium">{e.titulo}</span>
                <span className="text-gray-500">{new Date(e.evento_localizado_em).toLocaleString("pt-BR")}{e.tecnico ? ` · ${e.tecnico}` : ""}</span>
                <a className="ml-auto text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`}>Ver no mapa</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Um trecho: link do KMZ, situação das curvas (alerta com mais de 30 dias) e as últimas curvas (arquivos + fotos de OTDR de campo).
function TrechoCurvas({ rota, curvas, alternar, recarregar }: { rota: Rota; curvas: Curva[]; alternar: () => void; recarregar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [ponta, setPonta] = useState("");
  const ultima = curvas[0];
  const dias = ultima ? diasDesde(ultima.ultima_em) : null;
  const atrasado = rota.ativo && (dias == null || dias > DIAS_CURVA);

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true);
    const { data: sessao } = await supabase.auth.getSession();
    for (const arquivo of Array.from(arquivos)) {
      const nomeSeguro = arquivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const caminho = `${rota.id}/${data}_${crypto.randomUUID().slice(0, 8)}_${nomeSeguro}`;
      const { error: erroUp } = await supabase.storage.from("curvas").upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream" });
      if (erroUp) {
        alert(`${arquivo.name}: ${erroUp.message}`);
        continue;
      }
      const fibra = arquivo.name.match(/(?:^|[^a-z])(?:fo|fibra|f)[ _-]?(\d{1,3})(?!\d)/i)?.[1];
      const { error } = await supabase.from("rota_curvas").insert({
        rota_id: rota.id, tirada_em: data, caminho_arquivo: caminho, nome_arquivo: arquivo.name,
        fibra: fibra ? Number(fibra) : null, ponta: ponta.trim() || null, enviado_por: sessao.session?.user.id,
      });
      if (error) alert(`${arquivo.name}: ${error.message}`);
    }
    setEnviando(false);
    setAberto(true);
    recarregar();
  }

  async function abrir(c: Curva) {
    const { data: link, error } = await supabase.storage.from(c.bucket).createSignedUrl(c.caminho, 600);
    if (error || !link) return alert(error?.message ?? "Arquivo não encontrado");
    window.open(link.signedUrl, "_blank");
  }

  return (
    <li className={`border-b border-gray-100 p-4 text-sm last:border-0 ${atrasado ? "bg-red-50/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-medium ${rota.ativo ? "" : "text-gray-400 line-through"}`}>{rota.trecho}</span>
        {rota.descricao && <span className="text-gray-500">{rota.descricao}</span>}
        <a className="text-blue-700 hover:underline" href={rota.link_kmz} target="_blank" rel="noreferrer">KMZ</a>
        {dias == null ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">⚠ sem curvas</span>
        ) : dias > DIAS_CURVA ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">⚠ {dias} dias sem curva nova</span>
        ) : (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            curva em dia · última há {dias === 0 ? "hoje" : `${dias} dia(s)`}
          </span>
        )}
        <button className="text-blue-700 hover:underline" onClick={() => setAberto(!aberto)}>
          {aberto ? "▾" : "▸"} Curvas ({ultima?.total ?? 0})
        </button>
        <button className="ml-auto text-gray-600 hover:underline" onClick={alternar}>
          {rota.ativo ? "Ocultar do app" : "Mostrar no app"}
        </button>
      </div>
      {aberto && (
        <div className="mt-3 grid gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-gray-500">Data da medição
              <input type="date" className="rounded-lg border border-gray-300 p-1.5 text-sm text-gray-900" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-gray-500">Ponta / local (opcional)
              <input className="rounded-lg border border-gray-300 p-1.5 text-sm text-gray-900" placeholder="ex.: POP SJC → Taubaté" value={ponta} onChange={(e) => setPonta(e.target.value)} />
            </label>
            <label className={`cursor-pointer rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 ${enviando ? "opacity-50" : ""}`}>
              {enviando ? "Enviando..." : "Enviar curvas (.sor, PDF, imagem)"}
              <input type="file" multiple className="hidden" disabled={enviando} onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {curvas.length === 0 ? (
            <p className="text-gray-500">Nenhuma curva ainda. Envie os arquivos do OTDR ou registre a foto do OTDR na O.S. do trecho.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr><th className="py-1">Data</th><th>Arquivo</th><th>Origem</th><th>Fibra</th><th>Ponta / caixa</th><th>Enviado por</th></tr>
              </thead>
              <tbody>
                {curvas.map((c) => (
                  <tr key={`${c.bucket}/${c.caminho}`} className="border-t border-gray-100">
                    <td className="py-1.5 whitespace-nowrap">{new Date(c.tirada_em).toLocaleDateString("pt-BR")}</td>
                    <td><button className="text-left text-blue-700 hover:underline" onClick={() => abrir(c)}>{c.nome}</button></td>
                    <td>{c.origem === "campo" ? `Foto em campo · O.S. ${c.os_numero}` : "Arquivo"}</td>
                    <td>{c.fibra ?? "—"}</td>
                    <td>{c.ponta ?? "—"}</td>
                    <td>{c.enviado_por ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(ultima?.total ?? 0) > curvas.length && <p className="text-xs text-gray-500">Mostrando as {curvas.length} mais recentes de {ultima!.total}.</p>}
        </div>
      )}
    </li>
  );
}
