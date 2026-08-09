import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const config = {
  matcher: "/feed/:id",
};

/**
 * A missing permalink can only get a real 404 status if the check happens here, before React
 * rendering starts: the root loading.tsx Suspense-wraps every route, so by the time
 * feed/[id]/page.tsx's own database query resolves and calls notFound(), the response has
 * already started streaming as 200 and the status can't change (see README "Per-post permalinks
 * and dynamic previews"). A missing post rewrites to a path with no matching page at all, which
 * resolves synchronously — nothing to await — so Next can set a genuine 404 before sending
 * anything. This is only the existence check (indexed primary-key lookup, cheap, matches the
 * framework's own "keep proxy checks fast, avoid fetching full content" guidance) — the page
 * still does its own full fetch for real content.
 */
export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/").pop();
  if (!id) return NextResponse.next();

  const post = await prisma.post.findUnique({ where: { id }, select: { id: true } });
  if (!post) {
    return NextResponse.rewrite(new URL("/feed-post-not-found", request.url));
  }
  return NextResponse.next();
}
