import type { Metadata } from "next";
import { WatchDemo } from "@/components/WatchDemo";

export const metadata: Metadata = { title: "Watch a Live Pass — Medha" };

export default function WatchPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Watch a live pass</h1>
      <p className="mt-1 text-neutral-600">
        Trigger a real discover → judge → write → self-critique pass and watch it happen step by
        step — real sources, real scoring, real Groq calls. It never writes to the database: what
        you see here is a genuine preview, never published to the actual feed. The real autonomous
        cycle runs on its own schedule regardless, unaffected by this.
      </p>
      <div className="mt-8">
        <WatchDemo />
      </div>
    </div>
  );
}
