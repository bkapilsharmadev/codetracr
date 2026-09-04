import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JsonGraphRepository } from '../src/adapters/persistence/json/JsonGraphRepository.ts';

function fanOutGraph(edgeCount: number) {
  const nodes = [
    { id: 'hub', type: 'method', name: 'Hub.run' },
    ...Array.from({ length: edgeCount }, (_, i) => ({
      id: `leaf-${i}`,
      type: 'method',
      name: `Leaf.fn${i}`,
    })),
  ];
  const edges = Array.from({ length: edgeCount }, (_, i) => ({
    from: 'hub',
    to: `leaf-${i}`,
    type: 'CALLS',
    provenance: { certainty: 'DEFINITE' as const, confidence: 1 },
  }));
  return { nodes, edges };
}

const kafkaish = {
  nodes: [
    { id: 'a', type: 'method', name: 'Publisher.publish', file: 'src/pub.ts', line: 10 },
    { id: 't', type: 'event_topic', name: 'orders.created' },
    { id: 'b', type: 'method', name: 'Consumer.handle', file: 'src/con.ts', line: 4 },
  ],
  edges: [
    {
      from: 'a',
      to: 't',
      type: 'PUBLISHES',
      provenance: {
        certainty: 'DEFINITE' as const,
        confidence: 1,
        evidence: [{ provider: 'treesitter', file: 'src/pub.ts', line: 10 }],
      },
    },
    {
      from: 't',
      to: 'b',
      type: 'CONSUMED_BY',
      provenance: { certainty: 'DEFINITE' as const, confidence: 1 },
    },
  ],
};

describe('JsonGraphRepository', () => {
  it('indexes nodes and directed edges from CodeTracr JSON', async () => {
    const repo = new JsonGraphRepository(kafkaish, '<test>');
    const topic = await repo.getNode('t');
    assert.ok(topic);
    assert.equal(topic.label, 'orders.created');
    assert.equal(topic.kind, 'event_topic');

    const found = await repo.findNode('orders.created');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.id, 't');

    const outgoing = await repo.getOutgoingEdges('t');
    const incoming = await repo.getIncomingEdges('t');
    assert.equal(outgoing[0]?.relation, 'CONSUMED_BY');
    assert.equal(incoming[0]?.relation, 'PUBLISHES');

    const nodes = await repo.getNodes(['a', 'missing', 'b']);
    assert.deepEqual(
      nodes.map((n) => n.id),
      ['a', 'b'],
    );
  });

  it('applies optional limits on find and edge retrieval', async () => {
    const repo = new JsonGraphRepository(fanOutGraph(5), '<fanout>');
    assert.equal((await repo.getOutgoingEdges('hub')).length, 5);
    assert.equal((await repo.getOutgoingEdges('hub', 2)).length, 2);
    assert.equal((await repo.getIncomingEdges('leaf-0', 1)).length, 1);
    assert.equal((await repo.findNode('Leaf', 3)).length, 3);
    assert.equal((await repo.findNode('', 2)).length, 2);
  });

  it('rejects graphs without nodes and edges arrays', () => {
    assert.throws(() => new JsonGraphRepository({}, '<bad>'), /expected nodes\[] and edges\[]/);
  });
});
