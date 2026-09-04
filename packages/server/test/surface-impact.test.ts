import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { pickBestLineagePath } from '@codetracr/engine/graph';
import { JsonGraphRepository } from '../src/adapters/persistence/json/JsonGraphRepository.ts';
import { GraphService } from '../src/application/graph-service.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function serviceFrom(...parts: string[]) {
  return new GraphService(JsonGraphRepository.load(join(repoRoot, ...parts)));
}

describe('surface impact (CodeTracr semantic graph)', () => {
  it('returns HTTP and table buckets from golden semantic nodes', async () => {
    const graph = serviceFrom('generated', 'golden', 'codetracr-graph.json');
    const target = (await graph.search('OrderService.create')).find((n) => n.label === 'OrderService.create');
    assert.ok(target);
    const impact = await graph.surfaceImpact(target.id, 20);
    assert.ok(impact.endpoints.some((ep) => ep.method === 'POST' && ep.path === '/api/v1/orders'));
    assert.ok(impact.tables.some((t) => t.name === 'orders'));
    assert.equal(impact.external.length, 0);
  });

  it('returns Kafka publish/consume buckets from topic lineage', async () => {
    const graph = serviceFrom('generated', 'kafka', 'codetracr-graph.json');
    const topic = (await graph.search('orders.created')).find((n) => n.label === 'orders.created');
    assert.ok(topic);
    const impact = await graph.surfaceImpact(topic.id, 20);
    assert.ok(impact.kafka.publishes.some((p) => p.topic === 'orders.created'));
    assert.ok(impact.kafka.consumes.some((c) => c.topic === 'orders.created'));
  });
});

describe('path ranking', () => {
  it('prefers upstream path through route files when available', async () => {
    const graph = serviceFrom('generated', 'golden', 'codetracr-graph.json');
    const target = (await graph.search('OrderService.create')).find((n) => n.label === 'OrderService.create');
    assert.ok(target);
    const lineage = await graph.lineage(target.id, 20);
    const nodeById = new Map(lineage.nodes.map((n) => [n.id, n]));
    const best = pickBestLineagePath(lineage.paths, 'upstream', nodeById);
    assert.ok(best);
    assert.ok(best.nodeIds.some((id) => nodeById.get(id)?.kind === 'http_endpoint'));
  });
});
