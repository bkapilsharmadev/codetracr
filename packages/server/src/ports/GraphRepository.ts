import type { GraphEdge, GraphNode } from '@codetracr/engine/graph';

/**
 * Persistence port for a CodeTracr query graph.
 * Keep this next to the server application; engine stays free of storage concerns.
 *
 * Edge and search methods accept an optional `limit`. Omit it only for bounded
 * in-memory graphs; pass an explicit limit before swapping in SQLite/PG/Neo4j.
 */
export interface GraphRepository {
  getNode(id: string): Promise<GraphNode | null>;
  getNodes(ids: string[]): Promise<GraphNode[]>;
  getOutgoingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]>;
  getIncomingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]>;
  findNode(query: string, limit?: number): Promise<GraphNode[]>;
}
