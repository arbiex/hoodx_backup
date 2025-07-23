import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import GoogleAnalytics from "@/components/GoogleAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://roleta.bot'),
  title: "ROLETA.BOT - A matemática oculta da sorte",
  description: "Descubra os padrões ocultos nos jogos. Sistema de automação inteligente que revela a matemática por trás da sorte.",
  keywords: ["automação", "cassino", "bot", "multi-bot", "trading", "blaze", "matrix", "hacker"],
  authors: [{ name: "ROLETA.BOT" }],
  creator: "ROLETA.BOT",
  publisher: "ROLETA.BOT",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "16x16", type: "image/png" },
      { url: "/48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/isotipo.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/144x144.png", sizes: "144x144", type: "image/png" },
      { url: "/webclip.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/isotipo.svg",
        color: "#22C55E",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "ROLETA.BOT - A matemática oculta da sorte",
    description: "Descubra os padrões ocultos nos jogos. Sistema de automação inteligente que revela a matemática por trás da sorte.",
    url: "https://roleta.bot",
    siteName: "ROLETA.BOT",
    images: [
      {
        url: "/opengraph.webp",
        width: 1200,
        height: 630,
        alt: "ROLETA.BOT - Sistema de Automação Matrix",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ROLETA.BOT - A matemática oculta da sorte",
    description: "Descubra os padrões ocultos nos jogos. Sistema de automação inteligente que revela a matemática por trás da sorte.",
    images: ["/opengraph.webp"],
    creator: "@roletabot",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/48x48.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/96x96.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/192x192.png" />
        <link rel="icon" type="image/svg+xml" href="/isotipo.svg" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/152x152.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/144x144.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/webclip.png" />
        <link rel="mask-icon" href="/isotipo.svg" color="#22C55E" />
        <meta name="theme-color" content="#22C55E" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-TileImage" content="/144x144.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ROLETA.BOT" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="ROLETA.BOT" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleAnalytics />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
