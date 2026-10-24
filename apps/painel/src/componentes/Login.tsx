"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro("E-mail ou senha incorretos.");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Técnico Plus</h1>
        <p className="mb-6 text-sm text-gray-500">Painel do supervisor · Backbone Multivale</p>
        <input className="mb-3 w-full rounded-lg border border-gray-300 p-2.5" type="email" placeholder="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="mb-3 w-full rounded-lg border border-gray-300 p-2.5" type="password" placeholder="Senha"
          value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <p className="mb-3 text-sm text-red-700">{erro}</p>}
        <button className="w-full rounded-lg bg-blue-700 p-2.5 font-semibold text-white hover:bg-blue-800">Entrar</button>
      </form>
    </main>
  );
}
