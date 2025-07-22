import type { Metadata } from "next";
import InviteClient from './InviteClient';

export const metadata: Metadata = {
  title: "Convite Exclusivo - ROLETA.BOT | A matemática oculta da sorte",
  description: "Você foi convidado para descobrir a matemática oculta da sorte. Acesso exclusivo aos padrões que poucos conhecem.",
  keywords: ["convite", "círculo interno", "roleta bot", "trading", "automação", "exclusivo", "vip"],
  openGraph: {
    title: "Convite Exclusivo - ROLETA.BOT | A matemática oculta da sorte",
    description: "Você foi convidado para descobrir a matemática oculta da sorte. Acesso exclusivo aos padrões que poucos conhecem.",
    url: "https://roleta.bot/invite",
    images: [
      {
        url: "/opengraph.webp",
        width: 1200,
        height: 630,
        alt: "ROLETA.BOT - Convite Exclusivo para o Círculo Interno",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Convite Exclusivo - ROLETA.BOT | A matemática oculta da sorte",
    description: "Você foi convidado para descobrir a matemática oculta da sorte.",
    images: ["/opengraph.webp"],
  },
  robots: {
    index: false, // Não indexar páginas de convite
    follow: false,
  },
};

export default function InvitePage() {
  return <InviteClient />;
} 