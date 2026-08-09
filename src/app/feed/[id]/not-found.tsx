import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-2xl rounded border border-neutral-200 bg-white px-4 py-6 text-sm">
      <p className="text-neutral-700">No post exists at this link — it may have been mistyped, or the id is wrong.</p>
      <Link
        href="/feed"
        className="mt-3 inline-block rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Back to the feed
      </Link>
    </div>
  );
}
