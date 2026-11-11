"use client";

import { Hurricane } from "next/font/google";
import { useId } from "react";

const cursiva = Hurricane({ weight: "400", subsets: ["latin"], display: "block" });

// Assinatura gerada do nome (modelo 6 escolhido pelo Thiago): letra cursiva em azul de caneta, traço inteiro com
// alguns pontinhos de falha. O filtro fica dentro do próprio componente para sair igual no PDF (html-to-image).
export default function AssinaturaCursiva({ nome, tamanho = 46 }: { nome: string; tamanho?: number }) {
  const id = `bic${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className="relative inline-block" style={{ lineHeight: 1 }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={id} x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1" numOctaves="2" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7.5 5.9" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" result="t" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="2" result="w" />
          <feDisplacementMap in="t" in2="w" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span className={cursiva.className} style={{ fontSize: tamanho, color: "#1C3AA9", filter: `url(#${id})`, display: "inline-block", transform: "rotate(-2deg)", whiteSpace: "nowrap" }}>
        {nome}
        {/gomberg$/i.test(nome.trim()) ? (
          <span style={{ fontFamily: "serif", fontSize: Math.round(tamanho * 0.32), marginLeft: 3, verticalAlign: Math.round(tamanho * 0.12) }}>∴</span>
        ) : null}
      </span>
    </span>
  );
}
