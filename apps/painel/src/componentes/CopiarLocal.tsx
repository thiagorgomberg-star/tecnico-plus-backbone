"use client";

import { useState } from "react";

// Copia a localização (coordenadas + link do Google Maps) para colar no WhatsApp, e-mail ou outro sistema.
export default function CopiarLocal({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [copiado, setCopiado] = useState(false);
  const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  async function copiar() {
    const texto = `${coords}\nhttps://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Navegador sem permissão de área de transferência: mostra para copiar à mão.
      prompt("Copie a localização:", texto);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <button type="button" onClick={copiar} title={`Copia ${coords} e o link do Google Maps`}
      className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
      {copiado ? "✓ Copiado" : "📋 Copiar localização"}
    </button>
  );
}
