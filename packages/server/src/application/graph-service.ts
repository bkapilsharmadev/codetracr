import {
  buildGraphTraces,
  buildLineageGraph,
  computeSurfaceImpact,
  rankLineagePaths,
  UNLIMITED_DEPTH,
  type AnalyzerId,
  type GraphEdge,
  type GraphNode,
} from '@codetracr/engine/graph';
import type { GraphRepository } from '../ports/GraphRepository.ts';

/** Default cap for /callers and /callees (also applied at the repository). */
export const DEFAULT_NEIGHBOR_LIMIT = 50;

/**
 * Per-node edge cap while walking lineage/traces. Keeps future SQL adapters bounded
 * without changing fixture POC behavior today.
 */
export const DEFAULT_TRAVERSAL_EDGE_LIMIT = 500;

export class GraphService {
  readonly analyzerId: AnalyzerId = 'codetracr';
  private readonly repo: GraphRepository;

  constructor(repo: GraphRepository) {
    this.repo = repo;
  }

  async search(q: string, limit = 20): Promise<GraphNode[]> {
    return this.repo.findNode(q, limit);
  }

  async listSymbols(limit = 500): Promise<GraphNode[]> {
    const nodes = await this.repo.findNode('');
    return [...nodes]
      .sort((a, b) => a.label.localeCompare(b.label) || (a.file ?? '').localeCompare(b.file ?? ''))
      .slice(0, limit);
  }

  async getNode(id: string): Promise<GraphNode | null> {
    return this.repo.getNode(id);
  }

  async callers(id: string, limit = DEFAULT_NEIGHBOR_LIMIT): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const edges = await this.repo.getIncomingEdges(id, limit);
    const nodes = await this.repo.getNodes(edges.map((e) => e.from));
    return { nodes, edges };
  }

  async callees(id: string, limit = DEFAULT_NEIGHBOR_LIMIT): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const edges = await this.repo.getOutgoingEdges(id, limit);
    const nodes = await this.repo.getNodes(edges.map((e) => e.to));
    return { nodes, edges };
  }

  async impact(id: string, depth = 3) {
    const trace = await this.traces(id, depth + 2);
    const incoming = await this.repo.getIncomingEdges(id, DEFAULT_NEIGHBOR_LIMIT);
    const outgoing = await this.repo.getOutgoingEdges(id, DEFAULT_NEIGHBOR_LIMIT);
    const up = new Set(incoming.map((e) => e.from));
    const down = new Set(outgoing.map((e) => e.to));
    const allEdges = [...incoming, ...outgoing];
    const paths = [...trace.upstreamTraces, ...trace.downstreamTraces];
    const [upstream, downstream] = await Promise.all([
      this.repo.getNodes([...up]),
      this.repo.getNodes([...down]),
    ]);
    return {
      target: trace.target,
      upstream,
      downstream,
      paths: paths.slice(0, 40),
      edges: allEdges.slice(0, 200),
    };
  }

  async traces(id: string, depth = UNLIMITED_DEPTH) {
    const maps = await this.loadTraversalMaps(id, depth);
    if (!maps) throw new Error(`Node not found: ${id}`);
    const built = buildGraphTraces(id, maps.nodeById, maps.callerEdges, maps.calleeEdges, depth);
    return {
      target: maps.target,
      upstreamTraces: built.upstreamTraces,
      downstreamTraces: built.downstreamTraces,
      traceNodes: built.traceNodeIds
        .map((nodeId) => maps.nodeById.get(nodeId))
        .filter((n): n is GraphNode => Boolean(n)),
    };
  }

  async lineage(id: string, depth = UNLIMITED_DEPTH) {
    const maps = await this.loadTraversalMaps(id, depth);
    if (!maps) throw new Error(`Node not found: ${id}`);
    const result = buildLineageGraph(id, maps.nodeById, maps.callerEdges, maps.calleeEdges, depth);
    return {
      ...result,
      paths: rankLineagePaths(result.paths, maps.nodeById),
    };
  }

  async surfaceImpact(id: string, depth = UNLIMITED_DEPTH) {
    const maps = await this.loadTraversalMaps(id, depth);
    if (!maps) throw new Error(`Node not found: ${id}`);
    return computeSurfaceImpact(id, maps.nodeById, maps.callerEdges, maps.calleeEdges, depth);
  }

  private async loadTraversalMaps(startId: string, maxDepth: number) {
    const target = await this.repo.getNode(startId);
    if (!target) return null;

    const nodeById = new Map<string, GraphNode>([[startId, target]]);
    const callerEdges = new Map<string, GraphEdge[]>();
    const calleeEdges = new Map<string, GraphEdge[]>();
    const queue: Array<{ id: string; dist: number }> = [{ id: startId, dist: 0 }];
    const queued = new Set<string>([startId]);

    while (queue.length) {
      const { id, dist } = queue.shift()!;
      const [incoming, outgoing] = await Promise.all([
        this.repo.getIncomingEdges(id, DEFAULT_TRAVERSAL_EDGE_LIMIT),
        this.repo.getOutgoingEdges(id, DEFAULT_TRAVERSAL_EDGE_LIMIT),
      ]);
      callerEdges.set(id, incoming);
      calleeEdges.set(id, outgoing);

      const neighborIds = [...incoming.map((e) => e.from), ...outgoing.map((e) => e.to)];
      const missing = neighborIds.filter((nid) => !nodeById.has(nid));
      if (missing.length) {
        const found = await this.repo.getNodes(missing);
        for (const node of found) nodeById.set(node.id, node);
      }

      const unlimited = maxDepth === UNLIMITED_DEPTH;
      if (!unlimited && dist >= maxDepth) continue;
      for (const nid of neighborIds) {
        if (queued.has(nid) || !nodeById.has(nid)) continue;
        queued.add(nid);
        queue.push({ id: nid, dist: dist + 1 });
      }
    }

    return { target, nodeById, callerEdges, calleeEdges };
  }
}
