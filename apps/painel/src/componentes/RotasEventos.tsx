"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Rota = { id: string; trecho: string; descricao: string | null; link_kmz: string; ativo: boolean };
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
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("rotas").select("*").order("trecho").then(({ data }) => setRotas(data ?? []));
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

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 p-4 font-semibold">Rotas do backbone (KMZ por trecho)</h2>
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
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 text-sm last:border-0">
                <span className={`font-medium ${r.ativo ? "" : "text-gray-400 line-through"}`}>{r.trecho}</span>
                {r.descricao && <span className="text-gray-500">{r.descricao}</span>}
                <a className="text-blue-700 hover:underline" href={r.link_kmz} target="_blank" rel="noreferrer">abrir link</a>
                <button className="ml-auto text-gray-600 hover:underline" onClick={() => alternar(r)}>
                  {r.ativo ? "Ocultar do app" : "Mostrar no app"}
                </button>
              </li>
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
