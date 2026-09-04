import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GraphEdge, GraphNode } from '../src/graph/query-model.ts';
import { buildLineageGraph } from '../src/graph/lineage.ts';
import { computeSurfaceImpact } from '../src/graph/surface-impact.ts';

function node(id: string, label: string, kind: string, file?: string): GraphNode {
  return { id, label, kind, file, raw: { id, label, kind } };
}

function edge(from: string, to: string, relation: string): GraphEdge {
  return { from, to, relation, raw: { from, to, relation } };
}

describe('engine graph analysis', () => {
  it('walks PUBLISHES and CONSUMED_BY around a topic', () => {
    const publish = node('p', 'OrderEventPublisher.publish', 'method', 'src/publisher.ts');
    const topic = node('t', 'orders.created', 'event_topic');
    const consume = node('c', 'OrderCreatedConsumer.handle', 'method', 'src/consumer.ts');
    const nodeById = new Map<string, GraphNode>([
      [publish.id, publish],
      [topic.id, topic],
      [consume.id, consume],
    ]);
    const publishes = edge('p', 't', 'PUBLISHES');
    const consumedBy = edge('t', 'c', 'CONSUMED_BY');
    const callerEdges = new Map<string, GraphEdge[]>([
      ['t', [publishes]],
      ['c', [consumedBy]],
    ]);
    const calleeEdges = new Map<string, GraphEdge[]>([
      ['p', [publishes]],
      ['t', [consumedBy]],
    ]);

    const lineage = buildLineageGraph('t', nodeById, callerEdges, calleeEdges, 10);
    assert.ok(lineage.edges.some((e) => e.relation === 'PUBLISHES' && e.to === 't'));
    assert.ok(lineage.edges.some((e) => e.relation === 'CONSUMED_BY' && e.from === 't'));
    assert.ok(lineage.nodes.some((n) => n.label === 'OrderEventPublisher.publish'));
    assert.ok(lineage.nodes.some((n) => n.label === 'OrderCreatedConsumer.handle'));

    const impact = computeSurfaceImpact('t', nodeById, callerEdges, calleeEdges, 10);
    assert.ok(impact.kafka.publishes.some((item) => item.topic === 'orders.created'));
    assert.ok(impact.kafka.consumes.some((item) => item.topic === 'orders.created'));
  });
});
