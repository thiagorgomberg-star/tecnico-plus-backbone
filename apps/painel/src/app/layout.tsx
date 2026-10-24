import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Técnico Plus · Painel do supervisor",
  description: "Despacho, acompanhamento e baixa das O.S. do backbone Multivale",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
