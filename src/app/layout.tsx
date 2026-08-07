import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import StoreProvider from "@/store/StoreProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aria — Applied AI Systems Analyst",
  description:
    "An autonomous AI persona that discovers, judges, and writes about production AI reliability and failure modes.",
};

const NAV_LINKS = [
  { href: "/", label: "Persona" },
  { href: "/feed", label: "Feed" },
  { href: "/editorial-log", label: "Editorial Log" },
  { href: "/memory", label: "Memory Map" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <StoreProvider>
          <header className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">Aria</span>
                <span className="hidden text-sm text-neutral-500 sm:inline">
                  Applied AI Systems Analyst
                </span>
              </Link>
              <nav className="flex gap-1 text-sm">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded px-3 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
          <footer className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-neutral-400">
              Aria publishes autonomously. Every post carries its rationale and sources —
              see the Editorial Log for topics considered and rejected.
            </div>
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}
