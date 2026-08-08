import type { Metadata } from "next";
import { EDITORIAL_CONSTITUTION } from "@/lib/editorialConstitution";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Editorial Constitution — Medha" };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ConstitutionPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Editorial constitution</h1>
      <p className="mt-1 text-neutral-600">
        How Medha&apos;s editorial standards have actually changed, in order, with the reason each time.
        Not a designed feature — a record of real rule changes, most of them found by watching the
        system fail in a small, specific way and fixing exactly that.
      </p>

      <ol className="mt-8 space-y-6 border-l border-neutral-200 pl-6">
        {EDITORIAL_CONSTITUTION.map((entry, i) => (
          <li key={`${entry.date}-${entry.title}`} className="relative">
            <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full bg-neutral-400" />
            <time className="text-xs text-neutral-400">{formatDate(entry.date)}</time>
            <h2 className="mt-1 text-sm font-medium text-neutral-900">
              {i + 1}. {entry.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{entry.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
