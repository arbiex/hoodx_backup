import type { Metadata } from "next";
import InviteClient from './InviteClient';

export const metadata: Metadata = {
  title: "Convite Exclusivo - HOODX.AI | A matemática oculta da sorte",
  description: "Você foi convidado para descobrir a matemática oculta da sorte. Acesso exclusivo aos padrões que poucos conhecem.",
  keywords: ["convite", "círculo interno", "hoodx", "trading", "automação", "exclusivo", "vip"],
  openGraph: {
    title: "Convite Exclusivo - HOODX.AI | A matemática oculta da sorte",
    description: "Você foi convidado para descobrir a matemática oculta da sorte. Acesso exclusivo aos padrões que poucos conhecem.",
    url: "https://hoodx.ai/invite",
    images: [
      {
        url: "/opengraph.webp",
        width: 1200,
        height: 630,
        alt: "HOODX.AI - Convite Exclusivo para o Círculo Interno",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Convite Exclusivo - HOODX.AI | A matemática oculta da sorte",
    description: "Você foi convidado para descobrir a matemática oculta da sorte.",
    images: ["/opengraph.webp"],
  },
  robots: {
    index: false, // Não indexar páginas de convite
    follow: false,
  },
};

export default function InvitePage() {
  return <InviteClient />
} 