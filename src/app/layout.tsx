import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import StoreProvider from "@/store/StoreProvider";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/siteMeta";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "Medha",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
};

const NAV_LINKS = [
  { href: "/", label: "Persona" },
  { href: "/feed", label: "Feed" },
  { href: "/editorial-log", label: "Editorial Log" },
  { href: "/memory", label: "Memory Map" },
  { href: "/constitution", label: "Constitution" },
  { href: "/stats", label: "Stats" },
  { href: "/watch", label: "Watch Live" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50 font-sans text-neutral-900">
        <StoreProvider>
          <header className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">Medha</span>
                <span className="hidden text-sm text-neutral-500 sm:inline">
                  Applied AI Systems Analyst
                </span>
              </Link>
              <nav className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded px-2 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:px-3"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
          <footer className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-neutral-400 sm:px-6">
              Medha publishes autonomously. Every post carries its rationale and sources —
              see the Editorial Log for topics considered and rejected.
            </div>
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}
