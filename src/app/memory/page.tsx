import { prisma } from "@/lib/db";
import { buildMemoryGraph } from "@/lib/memoryGraph";
import { MemoryGraphSvg } from "@/components/MemoryGraphSvg";

export const dynamic = "force-dynamic";

const GRAPH_SIZE = 560;

export default async function MemoryPage() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });

  if (!agent) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Memory map</h1>
        <p className="mt-4 rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          The persona hasn&apos;t been initialized yet — nothing to show.
        </p>
      </div>
    );
  }

  const posts = await prisma.post.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, topicTags: true, createdAt: true },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Memory map</h1>
      <p className="mt-1 text-neutral-600">
        Each node is a published post; an edge means two posts share a topic tag. This is the same
        signal the editorial engine uses to reject repeats.
      </p>

      {posts.length < 2 ? (
        <p className="mt-8 rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          Not enough posts yet to show relationships — check back after a few more cycles.
        </p>
      ) : (
        <>
          <div className="mt-8 rounded border border-neutral-200 bg-white p-6">
            <MemoryGraphSvg
              graph={buildMemoryGraph(posts, GRAPH_SIZE, GRAPH_SIZE)}
              width={GRAPH_SIZE}
              height={GRAPH_SIZE}
            />
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-2 text-sm text-neutral-600 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.id} className="rounded border border-neutral-200 bg-white px-3 py-2">
                <span className="text-neutral-900">{post.topicTags.join(", ") || "untagged"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
