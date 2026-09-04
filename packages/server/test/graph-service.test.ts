import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JsonGraphRepository } from '../src/adapters/persistence/json/JsonGraphRepository.ts';
import { GraphService } from '../src/application/graph-service.ts';

const graph = {
  nodes: [
    { id: 'route', type: 'http_endpoint', name: 'POST /orders', file: 'src/routes.ts', line: 1 },
    { id: 'svc', type: 'method', name: 'OrderService.create', file: 'src/service.ts', line: 5 },
    { id: 'repo', type: 'method', name: 'OrderRepository.save', file: 'src/repo.ts', line: 8 },
    { id: 'table', type: 'database_table', name: 'orders' },
  ],
  edges: [
    {
      from: 'route',
      to: 'svc',
      type: 'HANDLES',
      provenance: { certainty: 'DEFINITE' as const, confidence: 1 },
    },
    {
      from: 'svc',
      to: 'repo',
      type: 'CALLS',
      provenance: {
        certainty: 'DEFINITE' as const,
        confidence: 1,
        occurrences: [{ line: 6, column: 4, order: 1 }],
      },
    },
    {
      from: 'repo',
      to: 'table',
      type: 'WRITES',
      provenance: { certainty: 'DEFINITE' as const, confidence: 1 },
    },
  ],
};

describe('GraphService', () => {
  const service = new GraphService(new JsonGraphRepository(graph, '<service-test>'));

  it('searches and lists symbols through the repository port', async () => {
    assert.equal(service.analyzerId, 'codetracr');
    const hits = await service.search('OrderService');
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, 'svc');

    const symbols = await service.listSymbols(10);
    assert.ok(symbols.some((n) => n.id === 'svc'));
    assert.ok(symbols.every((n, i) => i === 0 || symbols[i - 1]!.label.localeCompare(n.label) <= 0));
  });

  it('returns callers and callees with repository edge limits', async () => {
    const callers = await service.callers('svc');
    assert.equal(callers.edges.length, 1);
    assert.equal(callers.edges[0]?.from, 'route');
    assert.equal(callers.nodes[0]?.id, 'route');

    const callees = await service.callees('svc');
    assert.equal(callees.edges.length, 1);
    assert.equal(callees.edges[0]?.to, 'repo');

    const fan = new GraphService(
      new JsonGraphRepository(
        {
          nodes: [
            { id: 'hub', type: 'method', name: 'Hub.run' },
            { id: 'a', type: 'method', name: 'A.fn' },
            { id: 'b', type: 'method', name: 'B.fn' },
          ],
          edges: [
            { from: 'hub', to: 'a', type: 'CALLS', provenance: { certainty: 'DEFINITE' as const, confidence: 1 } },
            { from: 'hub', to: 'b', type: 'CALLS', provenance: { certainty: 'DEFINITE' as const, confidence: 1 } },
          ],
        },
        '<fan>',
      ),
    );
    const capped = await fan.callees('hub', 1);
    assert.equal(capped.edges.length, 1);
  });

  it('builds lineage, traces, and surface impact via engine algorithms', async () => {
    const lineage = await service.lineage('svc', 10);
    assert.equal(lineage.target.id, 'svc');
    assert.ok(lineage.nodes.some((n) => n.id === 'route'));
    assert.ok(lineage.nodes.some((n) => n.id === 'table'));
    assert.ok(lineage.edges.some((e) => e.relation === 'HANDLES'));
    assert.ok(lineage.edges.some((e) => e.relation === 'WRITES'));

    const traces = await service.traces('svc', 10);
    assert.ok(traces.upstreamTraces.length >= 1);
    assert.ok(traces.downstreamTraces.length >= 1);

    const surface = await service.surfaceImpact('svc', 10);
    assert.ok(surface.endpoints.some((ep) => ep.method === 'POST' && ep.path === '/orders'));
    assert.ok(surface.tables.some((t) => t.name === 'orders'));
  });

  it('throws when traces target is missing', async () => {
    await assert.rejects(() => service.traces('missing'), /Node not found/);
  });
});
