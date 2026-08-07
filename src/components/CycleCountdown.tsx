"use client";

import { useSyncExternalStore } from "react";

interface CycleCountdownProps {
  /** ISO timestamp of the most recent cycle activity, or null if none yet. */
  lastCycleAt: string | null;
  intervalHours: number;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "due now";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function subscribeToClock(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getClientTime() {
  return Date.now();
}

/** Deterministic across server render and hydration — the real clock
 * only takes over once mounted on the client, avoiding a hydration
 * mismatch without a setState-in-effect anti-pattern. */
function getServerTime() {
  return null;
}

/**
 * Computed client-side from the last known cycle activity + the
 * configured interval, per the build brief. This app doesn't control
 * cron-job.org's actual schedule, so "next cycle" here is an inference
 * (last activity + interval), not a literal read of the external cron
 * configuration — worded as such rather than overclaiming precision.
 */
export function CycleCountdown({ lastCycleAt, intervalHours }: CycleCountdownProps) {
  const now = useSyncExternalStore(subscribeToClock, getClientTime, getServerTime);

  if (!lastCycleAt) {
    return (
      <p className="text-sm text-neutral-500">
        First cycle pending — Aria hasn&apos;t run a discovery pass yet.
      </p>
    );
  }

  if (now === null) {
    return <p className="text-sm text-neutral-500">Estimating next cycle…</p>;
  }

  const nextCycleAt = new Date(lastCycleAt).getTime() + intervalHours * 60 * 60 * 1000;
  const remaining = nextCycleAt - now;

  return (
    <p className="text-sm text-neutral-500">
      Next cycle expected in{" "}
      <span className="font-medium text-neutral-800 tabular-nums">{formatRemaining(remaining)}</span>{" "}
      <span className="text-neutral-400">
        (estimated from the last cycle and a {intervalHours}h interval)
      </span>
    </p>
  );
}
