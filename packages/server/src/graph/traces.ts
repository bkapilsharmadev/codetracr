import type { GraphEdge, GraphNode } from './types.ts';
import { formatNodeLabel, isNoiseNode, UNLIMITED_DEPTH } from './graph-utils.ts';
import { scorePathLabels } from './path-ranking.ts';

export { isNoiseNode, NOISE_GATE_ENABLED, UNLIMITED_DEPTH } from './graph-utils.ts';

function scorePath(path: string[]): number {
  return scorePathLabels(path);
}

function rankPaths(paths: string[][], maxPaths: number): string[][] {
  if (maxPaths <= 0) return paths;
  return [...paths]
    .sort((a, b) => scorePath(b) - scorePath(a) || b.length - a.length)
    .slice(0, maxPaths);
}

function dedupeMaximalPaths(paths: string[][]): string[][] {
  const sorted = [...paths].sort((a, b) => b.length - a.length);
  const kept: string[][] = [];
  for (const path of sorted) {
    const key = path.join('\0');
    if (kept.some((other) => other.join('\0') === key)) continue;
    if (kept.some((other) => other.length >= path.length && containsSubsequence(other, path))) continue;
    kept.push(path);
  }
  return kept.sort((a, b) => a.join(' → ').localeCompare(b.join(' → ')));
}

function containsSubsequence(longer: string[], shorter: string[]): boolean {
  if (shorter.length > longer.length) return false;
  outer: for (let i = 0; i <= longer.length - shorter.length; i += 1) {
    for (let j = 0; j < shorter.length; j += 1) {
      if (longer[i + j] !== shorter[j]) continue outer;
    }
    return true;
  }
  return false;
}

function collectPaths(
  startId: string,
  neighborIds: (id: string) => string[],
  nodeById: Map<string, GraphNode>,
  maxDepth: number,
  maxPaths: number,
): { labels: string[][]; ids: string[][] } {
  const labelPaths: string[][] = [];
  const idPaths: string[][] = [];
  const unlimited = maxDepth === UNLIMITED_DEPTH;

  function dfs(cur: string, stack: string[], depth: number) {
    if (maxPaths > 0 && labelPaths.length >= maxPaths) return;
    if (!unlimited && depth > maxDepth) return;

    const neighbors = neighborIds(cur).filter((id) => !stack.includes(id) && !isNoiseNode(nodeById.get(id)));
    if (neighbors.length === 0) {
      if (stack.length > 1) {
        idPaths.push([...stack]);
        labelPaths.push(stack.map((id) => formatNodeLabel(nodeById.get(id)!)));
      }
      return;
    }

    let extended = false;
    for (const next of neighbors) {
      extended = true;
      dfs(next, [...stack, next], depth + 1);
    }
    if (!extended && stack.length > 1) {
      idPaths.push([...stack]);
      labelPaths.push(stack.map((id) => formatNodeLabel(nodeById.get(id)!)));
    }
  }

  dfs(startId, [startId], 0);
  const order = dedupeMaximalPaths(labelPaths).map((labels) => labels.join('\0'));
  const filteredIds: string[][] = [];
  const filteredLabels: string[][] = [];
  for (let i = 0; i < labelPaths.length; i += 1) {
    const key = labelPaths[i]!.join('\0');
    if (!order.includes(key)) continue;
    filteredLabels.push(labelPaths[i]!);
    filteredIds.push(idPaths[i]!);
  }
  return { labels: filteredLabels, ids: filteredIds };
}

export function buildGraphTraces(
  targetId: string,
  nodeById: Map<string, GraphNode>,
  callerEdges: Map<string, GraphEdge[]>,
  calleeEdges: Map<string, GraphEdge[]>,
  depth: number = UNLIMITED_DEPTH,
): {
  upstreamTraces: string[][];
  downstreamTraces: string[][];
  traceNodeIds: string[];
} {
  const listCap = depth === UNLIMITED_DEPTH ? 0 : 12;
  const upstream = collectPaths(
    targetId,
    (id) => (callerEdges.get(id) ?? []).map((e) => e.from),
    nodeById,
    depth,
    listCap > 0 ? 40 : 0,
  );
  const downstream = collectPaths(
    targetId,
    (id) => (calleeEdges.get(id) ?? []).map((e) => e.to),
    nodeById,
    depth,
    listCap > 0 ? 40 : 0,
  );

  const upstreamTraces = rankPaths(
    upstream.labels.map((path) => [...path].reverse()),
    listCap,
  );
  const downstreamTraces = rankPaths(downstream.labels, listCap);

  const traceNodeIds = new Set<string>([targetId]);
  for (const path of upstream.ids) for (const id of path) traceNodeIds.add(id);
  for (const path of downstream.ids) for (const id of path) traceNodeIds.add(id);

  return { upstreamTraces, downstreamTraces, traceNodeIds: [...traceNodeIds] };
}
