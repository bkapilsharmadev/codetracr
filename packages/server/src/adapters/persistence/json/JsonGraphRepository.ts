import { readFileSync } from 'node:fs';
import type { GraphEdge, GraphNode } from '@codetracr/engine/graph';
import type { GraphRepository } from '../../../ports/GraphRepository.ts';

interface CodeTracrEvidence {
  provider?: string;
  file?: string;
  line?: number;
  column?: number;
}

interface CodeTracrNode {
  id: string;
  type: string;
  name: string;
  file?: string;
  line?: number;
  evidence?: CodeTracrEvidence[];
  [key: string]: unknown;
}

interface CodeTracrOccurrence {
  line?: number;
  column?: number;
  order?: number;
  sourceRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

interface CodeTracrEdge {
  from: string;
  to: string;
  type: string;
  provenance?: {
    evidence?: CodeTracrEvidence[];
    confidence?: number;
    certainty?: 'DEFINITE' | 'POSSIBLE';
    occurrences?: CodeTracrOccurrence[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CodeTracrGraphFile {
  nodes: CodeTracrNode[];
  edges: CodeTracrEdge[];
}

function evidenceLocation(edge: CodeTracrEdge): CodeTracrEvidence | undefined {
  return (
    edge.provenance?.evidence?.find((evidence) => evidence.provider === 'treesitter') ??
    edge.provenance?.evidence?.[0]
  );
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

export class JsonGraphRepository implements GraphRepository {
  private readonly nodeById = new Map<string, GraphNode>();
  private readonly outgoing = new Map<string, GraphEdge[]>();
  private readonly incoming = new Map<string, GraphEdge[]>();
  private readonly searchNodes: GraphNode[];

  static load(graphJsonPath: string): JsonGraphRepository {
    const graph = JSON.parse(readFileSync(graphJsonPath, 'utf8')) as Partial<CodeTracrGraphFile>;
    return new JsonGraphRepository(graph, graphJsonPath);
  }

  constructor(graph: Partial<CodeTracrGraphFile>, source = '<memory>') {
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error(`Invalid CodeTracr graph: expected nodes[] and edges[] in ${source}`);
    }

    for (const node of graph.nodes) {
      const mapped: Record<string, unknown> = {
        ...node,
        id: String(node.id),
        label: String(node.name ?? node.id),
        kind: String(node.type ?? 'symbol').toLowerCase(),
        source_file: typeof node.file === 'string' ? node.file : undefined,
        source_location: typeof node.line === 'number' ? `L${node.line}` : undefined,
      };
      this.nodeById.set(String(node.id), toNode(mapped));
    }

    for (const edge of graph.edges) {
      const location = evidenceLocation(edge);
      const certainty = edge.provenance?.certainty;
      const confidenceScore = edge.provenance?.confidence;
      const raw: Record<string, unknown> = {
        ...edge,
        source: String(edge.from),
        target: String(edge.to),
        relation: String(edge.type),
        certainty,
        confidence_score: confidenceScore,
        confidence: certainty === 'POSSIBLE' ? 'INFERRED' : 'EXTRACTED',
        source_file: location?.file,
        source_location: typeof location?.line === 'number' ? `L${location.line}` : undefined,
        column: typeof location?.column === 'number' ? location.column : undefined,
        occurrences: edge.provenance?.occurrences,
      };
      const from = String(edge.from);
      const to = String(edge.to);
      const mapped: GraphEdge = {
        from,
        to,
        relation: typeof raw.relation === 'string' ? raw.relation : undefined,
        confidence: typeof raw.confidence === 'string' ? raw.confidence : undefined,
        certainty:
          raw.certainty === 'DEFINITE' || raw.certainty === 'POSSIBLE' ? raw.certainty : undefined,
        confidenceScore: typeof raw.confidence_score === 'number' ? raw.confidence_score : undefined,
        file: typeof raw.source_file === 'string' ? raw.source_file : undefined,
        line: parseLine(raw.source_location),
        column: typeof raw.column === 'number' ? raw.column : undefined,
        occurrences: Array.isArray(raw.occurrences)
          ? (raw.occurrences as GraphEdge['occurrences'])
          : undefined,
        raw,
      };
      if (!this.outgoing.has(from)) this.outgoing.set(from, []);
      this.outgoing.get(from)!.push(mapped);
      if (!this.incoming.has(to)) this.incoming.set(to, []);
      this.incoming.get(to)!.push(mapped);
    }

    this.searchNodes = [...this.nodeById.values()];
  }

  async getNode(id: string): Promise<GraphNode | null> {
    return this.nodeById.get(id) ?? null;
  }

  async getNodes(ids: string[]): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];
    for (const id of ids) {
      const node = this.nodeById.get(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  async getOutgoingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]> {
    return take(this.outgoing.get(nodeId) ?? [], limit);
  }

  async getIncomingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]> {
    return take(this.incoming.get(nodeId) ?? [], limit);
  }

  async findNode(query: string, limit?: number): Promise<GraphNode[]> {
    const needle = query.toLowerCase();
    const matches = this.searchNodes.filter((n) => {
      if (!needle) return true;
      const label = n.label.toLowerCase();
      const plain = normalizeLabel(label);
      return (
        label.includes(needle) ||
        plain.includes(needle) ||
        n.id.toLowerCase().includes(needle) ||
        (n.file?.toLowerCase().includes(needle) ?? false)
      );
    });
    return take(matches, limit);
  }
}

function take<T>(items: T[], limit?: number): T[] {
  if (limit === undefined) return items;
  if (limit <= 0) return [];
  return items.slice(0, limit);
}
