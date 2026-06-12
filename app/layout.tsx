import type { Metadata } from "next";
import { Albert_Sans, Fraunces, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Identidade "Partitura": serif expressiva nos títulos (programa de concerto),
// humanista limpa no corpo, mono musical nos números.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const corpo = Albert_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Orkestria — Planejamento de Rotinas Operacionais",
  description:
    "Planejamento visual de rotinas operacionais, ocupação de jornada e ociosidade prevista x realizada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // As variáveis de fonte precisam estar no <html> (:root), onde os tokens
  // --fonte-* de globals.css as referenciam.
  return (
    <html lang="pt-BR" className={`${display.variable} ${corpo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
