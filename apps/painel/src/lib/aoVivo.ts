// Janela de informações ao clicar num técnico (celular) ou carro (GEOCAR) no mapa ao vivo:
// situação agora, há quanto tempo está parado, km do dia e botão para navegar até ele.
import type { Map as MapaGl, Popup as PopupGl } from "maplibre-gl";

import { supabase } from "@/lib/supabase";
import { distanciaM, duracao, fmtKm, kmPercorridos } from "@/lib/trajeto";

type PontoVivo = { registrado_em: string; latitude: number; longitude: number; ignicao?: boolean | null; precisao_m?: number | null };
export type AlvoMapa = { tipo: "celular"; tecnicoId: string; nome: string } | { tipo: "veiculo"; viatId: number; nome: string; placa: string };

const RAIO_PARADO_M = 80;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const ha = (iso: string) => duracao(Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Desde quando está no mesmo lugar (até 80 m do último ponto).
function paradoDesde(ps: PontoVivo[]) {
  const ultimo = ps[ps.length - 1];
  if (!ultimo) return null;
  let desde = ultimo.registrado_em;
  for (let i = ps.length - 2; i >= 0 && distanciaM(ps[i], ultimo) <= RAIO_PARADO_M; i--) desde = ps[i].registrado_em;
  return new Date(ultimo.registrado_em).getTime() - new Date(desde).getTime() >= 2 * 60000 ? desde : null;
}

// Desde quando a ignição está como agora.
function ignicaoDesde(ps: PontoVivo[]) {
  const ultimo = ps[ps.length - 1];
  if (!ultimo || ultimo.ignicao == null) return null;
  let desde = ultimo.registrado_em;
  for (let i = ps.length - 2; i >= 0 && ps[i].ignicao === ultimo.ignicao; i--) desde = ps[i].registrado_em;
  return { ligado: ultimo.ignicao, desde, doInicio: ps[0].ignicao === ultimo.ignicao };
}

const inicioHoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export async function htmlInfoAoVivo(alvo: AlvoMapa, lat: number, lon: number) {
  const linhas: string[] = [];
  let titulo: string;
  if (alvo.tipo === "celular") {
    titulo = `${alvo.nome} · celular`;
    const [{ data: pts }, { data: atual }] = await Promise.all([
      supabase.from("trajeto_do_dia").select("registrado_em, latitude, longitude, precisao_m").eq("tecnico_id", alvo.tecnicoId).order("registrado_em").limit(20000),
      supabase.from("posicao_atual_tecnicos").select("registrado_em, velocidade_kmh, bateria_pct").eq("tecnico_id", alvo.tecnicoId).maybeSingle(),
    ]);
    const bons = ((pts as PontoVivo[]) ?? []).filter((p) => (p.precisao_m ?? 0) <= 50);
    const parado = paradoDesde(bons);
    linhas.push(parado ? `<b>Parado há ${ha(parado)}</b> (desde ${hora(parado)})` : (atual?.velocidade_kmh ?? 0) > 3 ? `<b>Em movimento</b> · ${Math.round(atual!.velocidade_kmh)} km/h` : "<b>Em movimento</b>");
    linhas.push(`Km hoje (GPS do app): <b>${fmtKm(kmPercorridos(bons))}</b>`);
    if (atual) linhas.push(`Sinal há ${ha(atual.registrado_em)}${atual.bateria_pct != null ? ` · bateria ${atual.bateria_pct}%` : ""}`);
  } else {
    titulo = `${alvo.nome} · carro ${alvo.placa}`;
    const [{ data: pts }, { data: atual }] = await Promise.all([
      supabase.from("geocar_posicoes").select("registrado_em, latitude, longitude, ignicao").eq("viat_id", alvo.viatId).gte("registrado_em", inicioHoje()).order("registrado_em").limit(20000),
      supabase.from("geocar_viaturas").select("datahora, latitude, longitude, ignicao, velocidade_kmh, rua").eq("viat_id", alvo.viatId).maybeSingle(),
    ]);
    const ps = (pts as PontoVivo[]) ?? [];
    if (atual?.datahora && atual.latitude != null && (!ps.length || ps[ps.length - 1].registrado_em < atual.datahora)) {
      ps.push({ registrado_em: atual.datahora, latitude: atual.latitude, longitude: atual.longitude!, ignicao: atual.ignicao });
    }
    const ign = ignicaoDesde(ps);
    if (ign) linhas.push(`<b>${ign.ligado ? "Ligado" : "Desligado"}</b> ${ign.doInicio ? "o dia todo" : `há ${ha(ign.desde)} (desde ${hora(ign.desde)})`}`);
    const parado = paradoDesde(ps);
    linhas.push(parado ? `Parado há <b>${ha(parado)}</b> (desde ${hora(parado)})` : `Em movimento${atual?.velocidade_kmh ? ` · ${atual.velocidade_kmh} km/h` : ""}`);
    linhas.push(`Km hoje (GEOCAR): <b>${fmtKm(kmPercorridos(ps))}</b>`);
    if (atual?.rua) linhas.push(esc(atual.rua));
    if (atual?.datahora) linhas.push(`Sinal há ${ha(atual.datahora)}`);
  }
  const navegar = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  return `<div style="min-width:220px;font-size:13px;line-height:1.45">
    <div style="font-weight:600;margin-bottom:4px">${esc(titulo)}</div>
    ${linhas.map((l) => `<div>${l}</div>`).join("")}
    <a href="${navegar}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 10px;border-radius:8px;background:#163A6B;color:#fff;text-decoration:none">Navegar até aqui</a>
  </div>`;
}

// Abre a janela no ponto clicado e preenche quando os dados chegam.
export function abrirInfoNoMapa(m: MapaGl, Popup: typeof PopupGl, alvo: AlvoMapa, lon: number, lat: number) {
  const janela = new Popup({ maxWidth: "300px" }).setLngLat([lon, lat])
    .setHTML('<div style="font-size:13px">Carregando...</div>').addTo(m);
  htmlInfoAoVivo(alvo, lat, lon)
    .then((html) => janela.setHTML(html))
    .catch(() => janela.setHTML('<div style="font-size:13px">Não foi possível carregar as informações.</div>'));
}

// Lê o alvo das propriedades do ponto clicado (tipo, tecnico_id ou viat_id, nome, placa).
export function alvoDoPonto(p: Record<string, unknown> | undefined): AlvoMapa | null {
  if (!p) return null;
  if (p.tipo === "veiculo" && p.viat_id != null) return { tipo: "veiculo", viatId: Number(p.viat_id), nome: String(p.nome ?? ""), placa: String(p.placa ?? "") };
  if (p.tipo === "celular" && p.tecnico_id) return { tipo: "celular", tecnicoId: String(p.tecnico_id), nome: String(p.nomeCompleto ?? p.nome ?? "") };
  return null;
}
