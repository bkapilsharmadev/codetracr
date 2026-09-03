import {
  buildGraphTraces,
  buildLineageGraph,
  computeSurfaceImpact,
  rankLineagePaths,
  UNLIMITED_DEPTH,
  type AnalyzerId,
  type GraphEdge,
  type GraphNode,
} from '../graph/index.ts';

export type { AnalyzerId, GraphEdge, GraphNode };

export interface GraphAnalyzerPort {
  id: AnalyzerId;
  search(q: string, limit?: number): GraphNode[];
  listSymbols(limit?: number): GraphNode[];
  getNode(id: string): GraphNode | undefined;
  callers(id: string, limit?: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  callees(id: string, limit?: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  impact(id: string, depth?: number): {
    target: GraphNode;
    upstream: GraphNode[];
    downstream: GraphNode[];
    paths: string[][];
    edges: GraphEdge[];
  };
  traces(id: string, depth?: number): {
    target: GraphNode;
    upstreamTraces: string[][];
    downstreamTraces: string[][];
    traceNodes: GraphNode[];
  };
  lineage(id: string, depth?: number): ReturnType<typeof buildLineageGraph>;
  surfaceImpact(id: string, depth?: number): ReturnType<typeof computeSurfaceImpact>;
}

export interface AnalyzerGraph {
  nodes: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
}

function parseLine(loc: unknown): number | undefined {
  if (typeof loc !== 'string' || !loc.startsWith('L')) return undefined;
  const n = Number(loc.slice(1));
  return Number.isFinite(n) ? n : undefined;
}

function toNode(n: Record<string, unknown>): GraphNode {
  const label = String(n.label ?? n.id);
  const kind =
    typeof n.kind === 'string'
      ? n.kind
      : n._callable
        ? 'callable'
        : label.endsWith('.ts') || label.endsWith('.js')
          ? 'module'
          : 'symbol';
  return {
    id: String(n.id),
    label,
    kind,
    file: typeof n.source_file === 'string' ? n.source_file : undefined,
    line: parseLine(n.source_location),
    raw: n,
  };
}

function normalizeLabel(label: string): string {
  let plain = label;
  if (plain.startsWith('.')) plain = plain.slice(1);
  if (plain.endsWith('()')) plain = plain.slice(0, -2);
  return plain;
}

export function loadGraphData(g: AnalyzerGraph, id: AnalyzerId): GraphAnalyzerPort {
  const nodeById = new Map<string, GraphNode>();
  for (const n of g.nodes ?? []) {
    nodeById.set(String(n.id), toNode(n));
  }

  const callerEdges = new Map<string, GraphEdge[]>();
  const calleeEdges = new Map<string, GraphEdge[]>();

  for (const link of g.links ?? []) {
    const from = String(link.source);
    const to = String(link.target);
    const edge: GraphEdge = {
      from,
      to,
      relation: typeof link.relation === 'string' ? link.relation : undefined,
      confidence: typeof link.confidence === 'string' ? link.confidence : undefined,
      certainty:
        link.certainty === 'DEFINITE' || link.certainty === 'POSSIBLE'
          ? link.certainty
          : undefined,
      confidenceScore:
        typeof link.confidence_score === 'number' ? link.confidence_score : undefined,
      file: typeof link.source_file === 'string' ? link.source_file : undefined,
      line: parseLine(link.source_location),
      column: typeof link.column === 'number' ? link.column : undefined,
      occurrences: Array.isArray(link.occurrences)
        ? (link.occurrences as GraphEdge['occurrences'])
        : undefined,
      raw: link,
    };
    if (!calleeEdges.has(from)) calleeEdges.set(from, []);
    calleeEdges.get(from)!.push(edge);
    if (!callerEdges.has(to)) callerEdges.set(to, []);
    callerEdges.get(to)!.push(edge);
  }

  const searchNodes = [...nodeById.values()];

  return {
    id,
    search(q, limit = 20) {
      const needle = q.toLowerCase();
      return searchNodes
        .filter((n) => {
          if (!needle) return true;
          const label = n.label.toLowerCase();
          const plain = normalizeLabel(label);
          return (
            label.includes(needle) ||
            plain.includes(needle) ||
            n.id.toLowerCase().includes(needle) ||
            (n.file?.toLowerCase().includes(needle) ?? false)
          );
        })
        .slice(0, limit);
    },
    listSymbols(limit = 500) {
      return [...searchNodes]
        .sort((a, b) => a.label.localeCompare(b.label) || (a.file ?? '').localeCompare(b.file ?? ''))
        .slice(0, limit);
    },
    getNode(id) {
      return nodeById.get(id);
    },
    callers(id, limit = 50) {
      const edges = (callerEdges.get(id) ?? []).slice(0, limit);
      const nodes = edges
        .map((e) => nodeById.get(e.from))
        .filter((n): n is GraphNode => Boolean(n));
      return { nodes, edges };
    },
    callees(id, limit = 50) {
      const edges = (calleeEdges.get(id) ?? []).slice(0, limit);
      const nodes = edges
        .map((e) => nodeById.get(e.to))
        .filter((n): n is GraphNode => Boolean(n));
      return { nodes, edges };
    },
    impact(id, depth = 3) {
      const trace = this.traces(id, depth + 2);
      const up = new Set<string>();
      const down = new Set<string>();
      const allEdges: GraphEdge[] = [];
      const paths: string[][] = [];

      for (const e of callerEdges.get(id) ?? []) {
        up.add(e.from);
        allEdges.push(e);
      }
      for (const e of calleeEdges.get(id) ?? []) {
        down.add(e.to);
        allEdges.push(e);
      }

      for (const path of trace.upstreamTraces) paths.push(path);
      for (const path of trace.downstreamTraces) paths.push(path);

      return {
        target: trace.target,
        upstream: [...up].map((x) => nodeById.get(x)).filter((n): n is GraphNode => Boolean(n)),
        downstream: [...down].map((x) => nodeById.get(x)).filter((n): n is GraphNode => Boolean(n)),
        paths: paths.slice(0, 40),
        edges: allEdges.slice(0, 200),
      };
    },
    traces(id, depth = UNLIMITED_DEPTH) {
      const target = nodeById.get(id);
      if (!target) throw new Error(`Node not found: ${id}`);
      const built = buildGraphTraces(id, nodeById, callerEdges, calleeEdges, depth);
      return {
        target,
        upstreamTraces: built.upstreamTraces,
        downstreamTraces: built.downstreamTraces,
        traceNodes: built.traceNodeIds
          .map((nodeId) => nodeById.get(nodeId))
          .filter((n): n is GraphNode => Boolean(n)),
      };
    },
    lineage(id, depth = UNLIMITED_DEPTH) {
      const result = buildLineageGraph(id, nodeById, callerEdges, calleeEdges, depth);
      return {
        ...result,
        paths: rankLineagePaths(result.paths, nodeById),
      };
    },
    surfaceImpact(id, depth = UNLIMITED_DEPTH) {
      return computeSurfaceImpact(id, nodeById, callerEdges, calleeEdges, depth);
    },
  };
}
