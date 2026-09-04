import type { GraphEdge, GraphNode, SurfaceImpactResult } from './query-model.ts';
import { buildLineageGraph, UNLIMITED_DEPTH, type LineageGraph } from './lineage.ts';

function displayName(node: GraphNode | undefined): string {
  if (!node) return '?';
  let plain = node.label;
  if (plain.startsWith('.')) plain = plain.slice(1);
  if (plain.endsWith('()')) plain = plain.slice(0, -2);
  const file = node.file?.split(/[/\\]/).pop();
  return file ? `${plain} (${file})` : plain;
}

function parseHttpEndpointLabel(label: string): { method: string; path: string } | null {
  const trimmed = label.trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) return null;
  const method = trimmed.slice(0, space).toUpperCase();
  const path = trimmed.slice(space + 1).trim();
  const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  if (!methods.has(method) || !path.startsWith('/')) return null;
  return { method, path };
}

/** Blast-radius buckets from CodeTracr semantic nodes already present in lineage. */
function harvestSemanticSurfaces(
  lineage: LineageGraph,
  nodeById: Map<string, GraphNode>,
): Pick<SurfaceImpactResult, 'endpoints' | 'tables' | 'kafka'> {
  const endpoints: SurfaceImpactResult['endpoints'] = [];
  const tables: SurfaceImpactResult['tables'] = [];
  const publishes: SurfaceImpactResult['kafka']['publishes'] = [];
  const consumes: SurfaceImpactResult['kafka']['consumes'] = [];

  for (const node of lineage.nodes) {
    const kind = (node.kind ?? '').toLowerCase();
    if (kind === 'http_endpoint') {
      const parsed = parseHttpEndpointLabel(node.label);
      if (!parsed) continue;
      const handlerEdge = lineage.edges.find(
        (e) => e.from === node.id && (e.relation ?? '').toUpperCase() === 'HANDLES',
      );
      const handler = handlerEdge ? displayName(nodeById.get(handlerEdge.to)) : node.label;
      endpoints.push({
        method: parsed.method,
        path: parsed.path,
        handler,
        evidence: node.file ? `${node.file}:${node.line ?? '?'}` : 'codetracr-graph',
        via: [handler],
      });
    }
    if (kind === 'database_table') {
      const writers = lineage.edges
        .filter(
          (e) =>
            e.to === node.id &&
            ['READS', 'WRITES'].includes((e.relation ?? '').toUpperCase()),
        )
        .map((e) => displayName(nodeById.get(e.from)));
      tables.push({
        name: node.label,
        via: writers.length ? writers : [node.label],
        evidence: node.file ? `${node.file}:${node.line ?? '?'}` : 'codetracr-graph',
      });
    }
    if (kind === 'event_topic') {
      const publishers = lineage.edges
        .filter((e) => e.to === node.id && (e.relation ?? '').toUpperCase() === 'PUBLISHES')
        .map((e) => displayName(nodeById.get(e.from)));
      const consumers = lineage.edges.filter(
        (e) => e.from === node.id && (e.relation ?? '').toUpperCase() === 'CONSUMED_BY',
      );
      if (publishers.length) {
        publishes.push({
          topic: node.label,
          via: publishers,
          evidence: 'codetracr-graph',
        });
      }
      for (const edge of consumers) {
        const consumerNode = nodeById.get(edge.to);
        consumes.push({
          topic: node.label,
          consumer: displayName(consumerNode),
          callback: consumerNode?.label,
          evidence: consumerNode?.file
            ? `${consumerNode.file}:${consumerNode.line ?? '?'}`
            : 'codetracr-graph',
        });
      }
    }
  }

  return {
    endpoints,
    tables,
    kafka: { publishes, consumes },
  };
}

export function computeSurfaceImpact(
  targetId: string,
  nodeById: Map<string, GraphNode>,
  callerEdges: Map<string, GraphEdge[]>,
  calleeEdges: Map<string, GraphEdge[]>,
  maxDepth = UNLIMITED_DEPTH,
): SurfaceImpactResult {
  const target = nodeById.get(targetId);
  if (!target) throw new Error(`Node not found: ${targetId}`);

  const lineage = buildLineageGraph(targetId, nodeById, callerEdges, calleeEdges, maxDepth);
  const semantic = harvestSemanticSurfaces(lineage, nodeById);

  return {
    target: { id: target.id, label: target.label, file: target.file, line: target.line },
    endpoints: semantic.endpoints,
    tables: semantic.tables,
    kafka: semantic.kafka,
    external: [],
  };
}
