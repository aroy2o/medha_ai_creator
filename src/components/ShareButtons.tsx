"use client";

import { useState } from "react";
import { buildShareLinks, buildThreadsClipboardText } from "@/lib/shareLinks";

const buttonClass =
  "rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-50";

function openShareWindow(href: string) {
  window.open(href, "_blank", "noopener,noreferrer,width=600,height=520");
}

/**
 * `postPath` is a relative path (e.g. "/feed#post-abc123"); the absolute URL is resolved from
 * `window.location.origin` at click time, not render time, so this component stays SSR-safe.
 */
export function ShareButtons({ text, postPath }: { text: string; postPath: string }) {
  const [copied, setCopied] = useState(false);

  const resolveUrl = () => `${window.location.origin}${postPath}`;

  const share = (platform: "x" | "linkedin" | "whatsapp") => {
    const links = buildShareLinks(text, resolveUrl());
    openShareWindow(links[platform]);
  };

  const copyForThreads = async () => {
    try {
      await navigator.clipboard.writeText(buildThreadsClipboardText(text, resolveUrl()));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context / old browser) — no-op; the post text is
      // already visible on the page for a manual copy.
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Share</span>
      <button type="button" onClick={() => share("x")} className={buttonClass} aria-label="Share on X">
        X
      </button>
      <button type="button" onClick={() => share("linkedin")} className={buttonClass} aria-label="Share on LinkedIn">
        LinkedIn
      </button>
      <button type="button" onClick={() => share("whatsapp")} className={buttonClass} aria-label="Share on WhatsApp">
        WhatsApp
      </button>
      <button
        type="button"
        onClick={copyForThreads}
        className={buttonClass}
        aria-label="Copy post text and link for Threads"
      >
        {copied ? "Copied for Threads" : "Threads"}
      </button>
    </div>
  );
}
