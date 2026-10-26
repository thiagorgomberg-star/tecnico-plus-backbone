"use client";

import { useEffect, useState } from "react";

import { Cliente, fmtSla, listarClientes } from "@/lib/clientes";
import { supabase } from "@/lib/supabase";

// Cadastro de clientes com o SLA de cada um (em horas). A O.S. usa o menor SLA entre os clientes dela.
export default function Clientes() {
  const [lista, setLista] = useState<Cliente[]>([]);
  const [nome, setNome] = useState("");
  const [sla, setSla] = useState("4");
  const carregar = () => listarClientes().then(setLista);
  useEffect(() => { carregar(); }, []);

  async function adicionar() {
    const horas = Number(sla.replace(",", "."));
    if (!nome.trim()) return alert("Informe o nome do cliente.");
    if (!(horas > 0)) return alert("Informe o SLA em horas (ex.: 4 ou 2,5).");
    const { error } = await supabase.from("clientes").insert({ nome: nome.trim(), sla_horas: horas });
    if (error) return alert(error.message.includes("duplicate") ? "Já existe um cliente com esse nome." : error.message);
    setNome(""); setSla("4"); carregar();
  }
  async function alterar(c: Cliente, parte: Partial<Cliente>) {
    const { error } = await supabase.from("clientes").update(parte).eq("id", c.id);
    if (error) return alert(error.message);
    carregar();
  }

  const campo = "rounded-lg border border-gray-300 p-2 text-sm";
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 p-4 font-semibold">Clientes e SLA</h2>
      <p className="px-4 pt-3 text-sm text-gray-500">
        O SLA conta a partir do cadastro da O.S. Quando o evento atende mais de um cliente, vale o menor SLA. Mudar o SLA aqui vale para as O.S. novas.
      </p>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="grid gap-1 text-sm"><span className="font-medium text-gray-700">Nome do cliente</span>
          <input className={`${campo} w-64`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Claro" />
        </label>
        <label className="grid gap-1 text-sm"><span className="font-medium text-gray-700">SLA (horas)</span>
          <input className={`${campo} w-28`} inputMode="decimal" value={sla} onChange={(e) => setSla(e.target.value)} />
        </label>
        <button className="rounded-lg bg-[#163A6B] px-4 py-2 text-sm font-medium text-white hover:opacity-90" onClick={adicionar}>Adicionar</button>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-y border-gray-200 bg-gray-50 text-xs text-gray-500">
          <tr><th className="p-3">Cliente</th><th>SLA</th><th>Situação</th><th /></tr>
        </thead>
        <tbody>
          {lista.length === 0 ? <tr><td colSpan={4} className="p-4 text-gray-500">Nenhum cliente cadastrado.</td></tr> : lista.map((c) => (
            <tr key={c.id} className="border-b border-gray-100">
              <td className="p-3 font-medium">{c.nome}</td>
              <td>{fmtSla(c.sla_horas)}</td>
              <td>{c.ativo ? <span className="text-green-700">Ativo</span> : <span className="text-gray-500">Inativo</span>}</td>
              <td className="space-x-3 pr-3 text-right">
                <button className="text-blue-700 hover:underline" onClick={() => {
                  const v = prompt(`SLA de ${c.nome} em horas:`, String(c.sla_horas).replace(".", ","));
                  const h = v ? Number(v.replace(",", ".")) : NaN;
                  if (h > 0) alterar(c, { sla_horas: h });
                }}>Alterar SLA</button>
                <button className="text-gray-700 hover:underline" onClick={() => alterar(c, { ativo: !c.ativo })}>{c.ativo ? "Desativar" : "Ativar"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
