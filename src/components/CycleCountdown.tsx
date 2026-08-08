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

// useSyncExternalStore requires getSnapshot to return a referentially
// stable value between store-change notifications — calling Date.now()
// directly inside getSnapshot returns a *new* value on every call
// (including the extra calls React makes just to check for changes),
// which never compares equal and triggers "getSnapshot should be
// cached" / an infinite render loop. The clock's current value is
// cached here and only advances once per tick, on the same cadence as
// the subscription notifying React that something actually changed.
let cachedTime = Date.now();

function subscribeToClock(callback: () => void) {
  const id = setInterval(() => {
    cachedTime = Date.now();
    callback();
  }, 1000);
  return () => clearInterval(id);
}

function getClientTime() {
  return cachedTime;
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
        First cycle pending — Medha hasn&apos;t run a discovery pass yet.
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
