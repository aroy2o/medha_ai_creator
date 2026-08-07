"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("route render failed", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="max-w-2xl rounded border border-neutral-200 bg-white px-4 py-6 text-sm">
      <p className="text-neutral-700">Something went wrong loading this page.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Try again
      </button>
    </div>
  );
}
