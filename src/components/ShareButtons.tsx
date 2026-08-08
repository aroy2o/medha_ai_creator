"use client";

import { useState } from "react";
import { buildLinkedInClipboardText, buildShareLinks, buildThreadsClipboardText } from "@/lib/shareLinks";

const buttonClass =
  "rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-50";

function openShareWindow(href: string) {
  window.open(href, "_blank", "noopener,noreferrer,width=600,height=520");
}

type CopiedFor = "linkedin" | "threads" | null;

/**
 * `postPath` is a relative path (e.g. "/feed#post-abc123"); the absolute URL is resolved from
 * `window.location.origin` at click time, not render time, so this component stays SSR-safe.
 */
export function ShareButtons({ text, postPath }: { text: string; postPath: string }) {
  const [copiedFor, setCopiedFor] = useState<CopiedFor>(null);

  const resolveUrl = () => `${window.location.origin}${postPath}`;

  const copyToClipboard = (value: string, platform: Exclude<CopiedFor, null>) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedFor(platform);
        setTimeout(() => setCopiedFor((current) => (current === platform ? null : current)), 2500);
      },
      () => {
        // Clipboard API unavailable (insecure context / old browser) — no-op; the post text is
        // already visible on the page for a manual copy.
      },
    );
  };

  const share = (platform: "x" | "whatsapp") => openShareWindow(buildShareLinks(text, resolveUrl())[platform]);

  const shareLinkedIn = () => {
    // LinkedIn's dialog can't be prefilled (see shareLinks.ts), so this copies the post text and
    // opens the dialog at once — the window opens synchronously, before the async clipboard
    // write, so the popup blocker still sees it as a direct response to the click.
    openShareWindow(buildShareLinks(text, resolveUrl()).linkedin);
    copyToClipboard(buildLinkedInClipboardText(text), "linkedin");
  };

  const copyForThreads = () => copyToClipboard(buildThreadsClipboardText(text, resolveUrl()), "threads");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Share</span>
      <button type="button" onClick={() => share("x")} className={buttonClass} aria-label="Share on X">
        X
      </button>
      <button
        type="button"
        onClick={shareLinkedIn}
        className={buttonClass}
        aria-label="Copy post text and open LinkedIn's share dialog"
      >
        {copiedFor === "linkedin" ? "Copied — paste it in" : "LinkedIn"}
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
        {copiedFor === "threads" ? "Copied for Threads" : "Threads"}
      </button>
    </div>
  );
}
