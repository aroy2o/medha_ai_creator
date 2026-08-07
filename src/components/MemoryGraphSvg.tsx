import type { MemoryGraph } from "@/lib/memoryGraph";

function truncate(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function MemoryGraphSvg({
  graph,
  width,
  height,
}: {
  graph: MemoryGraph;
  width: number;
  height: number;
}) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Map of how published posts relate to each other via shared topics"
    >
      {graph.edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.source}-${edge.target}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke="#d4d4d4"
            strokeWidth={Math.min(1 + edge.sharedTags.length, 4)}
          >
            <title>{`Shared: ${edge.sharedTags.join(", ")}`}</title>
          </line>
        );
      })}
      {graph.nodes.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r={9} fill="#171717" stroke="#ffffff" strokeWidth={2}>
            <title>{node.topicTags.join(", ") || node.label}</title>
          </circle>
          <text
            x={node.x}
            y={node.y + (node.y > height / 2 ? 22 : -16)}
            textAnchor="middle"
            fontSize={11}
            fill="#525252"
          >
            {truncate(node.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}
