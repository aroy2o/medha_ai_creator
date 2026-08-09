"use client";

import { useRef, useState, type ReactNode } from "react";

interface Scores {
  relevance: number;
  substance: number;
  timeliness: number;
  novelty: number;
  credibility: number;
  corroboration: number;
}

interface JudgedWinner {
  title: string;
  source: string;
  url: string;
  weightedTotal: number;
  scores: Scores;
  corroboratingSources: string[];
}

interface Alternative {
  title: string;
  source: string;
  weightedTotal: number;
  category: string;
  tone: string;
}

interface FinalPost {
  text: string;
  rationale: string;
  topicTags: string[];
  stance: string;
  sources: string[];
}

type PreviewEvent =
  | { type: "discovery-started" }
  | { type: "discovery-source"; source: string; count: number; error: string | null }
  | { type: "discovery-complete"; totalCandidates: number }
  | { type: "judging-started" }
  | { type: "judged"; winner: JudgedWinner | null; consideredCount: number; topAlternatives: Alternative[] }
  | { type: "writing-started" }
  | { type: "draft"; attempt: number; text: string; whySelected: string; topicTags: string[]; stance: string }
  | { type: "critique"; attempt: number; approved: boolean; score: number; feedback: string }
  | { type: "done"; published: boolean; reason?: string; post?: FinalPost };

type Status = "idle" | "running" | "done" | "error" | "cooldown";

const stepClass = "rounded border border-neutral-200 bg-white p-4";
const labelClass = "text-xs font-medium uppercase tracking-wide text-neutral-400";

function DiscoveryStep({ events }: { events: PreviewEvent[] }) {
  const sources = events.filter((e): e is Extract<PreviewEvent, { type: "discovery-source" }> => e.type === "discovery-source");
  const complete = events.find((e) => e.type === "discovery-complete") as Extract<PreviewEvent, { type: "discovery-complete" }> | undefined;
  if (sources.length === 0) return null;

  return (
    <div className={stepClass}>
      <p className={labelClass}>Discovery</p>
      <ul className="mt-2 space-y-1 text-sm text-neutral-700">
        {sources.map((s) => (
          <li key={s.source}>
            {s.source}: {s.error ? <span className="text-neutral-400">unavailable ({s.error})</span> : `${s.count} candidate${s.count === 1 ? "" : "s"}`}
          </li>
        ))}
      </ul>
      {complete && (
        <p className="mt-2 text-sm text-neutral-500">{complete.totalCandidates} candidates found across all sources.</p>
      )}
    </div>
  );
}

function JudgedStep({ event }: { event: Extract<PreviewEvent, { type: "judged" }> }) {
  return (
    <div className={stepClass}>
      <p className={labelClass}>Editorial judgment</p>
      <p className="mt-2 text-sm text-neutral-600">{event.consideredCount} other candidates considered.</p>
      {event.winner ? (
        <div className="mt-3 rounded border border-neutral-100 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-900">{event.winner.title}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {event.winner.source} — {event.winner.weightedTotal}/10 weighted score
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            relevance {event.winner.scores.relevance} · substance {event.winner.scores.substance} · timeliness{" "}
            {event.winner.scores.timeliness} · novelty {event.winner.scores.novelty} · credibility{" "}
            {event.winner.scores.credibility} · corroboration {event.winner.scores.corroboration}
          </p>
          {event.winner.corroboratingSources.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Corroborated by {event.winner.corroboratingSources.join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-700">Nothing cleared the editorial bar this run.</p>
      )}
      {event.topAlternatives.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-neutral-500">
          {event.topAlternatives.map((alt) => (
            <li key={alt.title}>
              {alt.title} ({alt.source}) — {alt.weightedTotal}/10, {alt.tone}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftStep({ event }: { event: Extract<PreviewEvent, { type: "draft" }> }) {
  return (
    <div className={stepClass}>
      <p className={labelClass}>Draft{event.attempt > 1 ? ` (revision ${event.attempt})` : ""}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">{event.text}</p>
      <p className="mt-2 text-xs text-neutral-500">Stance: {event.stance}</p>
    </div>
  );
}

function CritiqueStep({ event }: { event: Extract<PreviewEvent, { type: "critique" }> }) {
  return (
    <div className={stepClass}>
      <p className={labelClass}>Self-critique{event.attempt > 1 ? ` (revision ${event.attempt})` : ""}</p>
      <p className="mt-2 text-sm text-neutral-700">
        {event.score}/10 — {event.approved ? "approved" : "not approved, revising"}
      </p>
      <p className="mt-1 text-sm text-neutral-600">{event.feedback}</p>
    </div>
  );
}

function DoneStep({ event }: { event: Extract<PreviewEvent, { type: "done" }> }) {
  if (!event.published || !event.post) {
    return (
      <div className={stepClass}>
        <p className={labelClass}>Result</p>
        <p className="mt-2 text-sm text-neutral-700">Nothing published this run. {event.reason}</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-neutral-300 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Preview post — not published to the real feed
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">{event.post.text}</p>
      <div className="mt-3 border-t border-neutral-100 pt-3">
        <p className={labelClass}>Rationale</p>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{event.post.rationale}</p>
      </div>
    </div>
  );
}

export function WatchDemo() {
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    setEvents([]);
    setMessage(null);
    setStatus("running");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/preview", { method: "POST", signal: controller.signal });
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error ?? "A preview run is cooling down — try again shortly.");
        setStatus("cooldown");
        return;
      }
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Preview request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as PreviewEvent;
          setEvents((prev) => [...prev, parsed]);
        }
      }
      setStatus("done");
    } catch (err) {
      if (controller.signal.aborted) return;
      setMessage(err instanceof Error ? err.message : "Preview run failed.");
      setStatus("error");
    }
  };

  const judgedEvent = events.find((e): e is Extract<PreviewEvent, { type: "judged" }> => e.type === "judged");
  const draftEvents = events.filter((e): e is Extract<PreviewEvent, { type: "draft" }> => e.type === "draft");
  const critiqueEvents = events.filter((e): e is Extract<PreviewEvent, { type: "critique" }> => e.type === "critique");
  const doneEvent = events.find((e): e is Extract<PreviewEvent, { type: "done" }> => e.type === "done");
  const steps: ReactNode[] = [];
  if (events.some((e) => e.type === "discovery-source" || e.type === "discovery-complete")) {
    steps.push(<DiscoveryStep key="discovery" events={events} />);
  }
  if (judgedEvent) steps.push(<JudgedStep key="judged" event={judgedEvent} />);
  draftEvents.forEach((e, i) => steps.push(<DraftStep key={`draft-${i}`} event={e} />));
  critiqueEvents.forEach((e, i) => steps.push(<CritiqueStep key={`critique-${i}`} event={e} />));
  if (doneEvent) steps.push(<DoneStep key="done" event={doneEvent} />);

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "running" ? "Running a live pass…" : "Run a live preview"}
      </button>

      {message && <p className="mt-3 text-sm text-neutral-600">{message}</p>}

      {steps.length > 0 && <div className="mt-6 space-y-4">{steps}</div>}
    </div>
  );
}
