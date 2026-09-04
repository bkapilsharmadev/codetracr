import type { GraphEdge, GraphNode } from './query-model.ts';
import { isNoiseNode, UNLIMITED_DEPTH } from './graph-utils.ts';

export { UNLIMITED_DEPTH } from './graph-utils.ts';

export interface LineageNode extends GraphNode {
  /** Negative = upstream hops, 0 = target, positive = downstream hops */
  hop: number;
}

export interface LineagePath {
  direction: 'upstream' | 'downstream';
  nodeIds: string[];
}

export interface LineageGraph {
  target: GraphNode;
  nodes: LineageNode[];
  edges: GraphEdge[];
  paths: LineagePath[];
  stats: { nodeCount: number; edgeCount: number; maxHop: number };
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.from}\0${edge.to}\0${edge.relation ?? 'calls'}`;
}

export function buildLineageGraph(
  targetId: string,
  nodeById: Map<string, GraphNode>,
  callerEdges: Map<string, GraphEdge[]>,
  calleeEdges: Map<string, GraphEdge[]>,
  maxDepth = UNLIMITED_DEPTH,
  includeNoise = false,
): LineageGraph {
  const target = nodeById.get(targetId);
  if (!target) throw new Error(`Node not found: ${targetId}`);

  const hopById = new Map<string, number>([[targetId, 0]]);
  const edgeSet = new Map<string, GraphEdge>();
  const paths: LineagePath[] = [];

  function shouldVisit(nodeId: string): boolean {
    if (!includeNoise && isNoiseNode(nodeById.get(nodeId))) return false;
    return nodeById.has(nodeId);
  }

  function walk(
    direction: 'upstream' | 'downstream',
    cur: string,
    stack: string[],
    depth: number,
  ) {
    if (maxDepth > 0 && depth > maxDepth) return;

    const edges = direction === 'upstream' ? (callerEdges.get(cur) ?? []) : (calleeEdges.get(cur) ?? []);
    let extended = false;

    for (const edge of edges) {
      const next = direction === 'upstream' ? edge.from : edge.to;
      if (!shouldVisit(next) || stack.includes(next)) continue;
      extended = true;
      edgeSet.set(edgeKey(edge), edge);

      const nextHop = direction === 'upstream' ? -(depth + 1) : depth + 1;
      const prevHop = hopById.get(next);
      if (prevHop === undefined || Math.abs(nextHop) < Math.abs(prevHop)) {
        hopById.set(next, nextHop);
      }

      walk(direction, next, [...stack, next], depth + 1);
    }

    if (!extended && stack.length > 1) {
      paths.push({ direction, nodeIds: [...stack] });
    }
  }

  walk('upstream', targetId, [targetId], 0);
  walk('downstream', targetId, [targetId], 0);

  const nodes: LineageNode[] = [...hopById.entries()]
    .map(([id, hop]) => {
      const node = nodeById.get(id);
      if (!node) return undefined;
      return { ...node, hop };
    })
    .filter((n): n is LineageNode => Boolean(n))
    .sort((a, b) => a.hop - b.hop || a.label.localeCompare(b.label));

  const maxHop = nodes.reduce((max, n) => Math.max(max, Math.abs(n.hop)), 0);

  return {
    target,
    nodes,
    edges: [...edgeSet.values()],
    paths,
    stats: { nodeCount: nodes.length, edgeCount: edgeSet.size, maxHop },
  };
}
