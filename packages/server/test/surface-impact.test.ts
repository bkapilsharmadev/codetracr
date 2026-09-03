import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadCodeTracrJsonAdapter } from '../src/adapters/codetracr-json.ts';
import { pickBestLineagePath } from '../src/graph/path-ranking.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('surface impact (CodeTracr semantic graph)', () => {
  it('returns HTTP and table buckets from golden semantic nodes', () => {
    const adapter = loadCodeTracrJsonAdapter(
      join(repoRoot, 'packages', 'engine', 'generated', 'codetracr-graph.json'),
    );
    const target = adapter.search('OrderService.create').find((n) => n.label === 'OrderService.create');
    assert.ok(target);
    const impact = adapter.surfaceImpact(target.id, 20);
    assert.ok(impact.endpoints.some((ep) => ep.method === 'POST' && ep.path === '/api/v1/orders'));
    assert.ok(impact.tables.some((t) => t.name === 'orders'));
    assert.equal(impact.external.length, 0);
  });

  it('returns Kafka publish/consume buckets from topic lineage', () => {
    const adapter = loadCodeTracrJsonAdapter(
      join(repoRoot, 'packages', 'engine', 'generated', 'kafka', 'codetracr-graph.json'),
    );
    const topic = adapter.search('orders.created').find((n) => n.label === 'orders.created');
    assert.ok(topic);
    const impact = adapter.surfaceImpact(topic.id, 20);
    assert.ok(impact.kafka.publishes.some((p) => p.topic === 'orders.created'));
    assert.ok(impact.kafka.consumes.some((c) => c.topic === 'orders.created'));
  });
});

describe('path ranking', () => {
  it('prefers upstream path through route files when available', () => {
    const adapter = loadCodeTracrJsonAdapter(
      join(repoRoot, 'packages', 'engine', 'generated', 'codetracr-graph.json'),
    );
    const target = adapter.search('OrderService.create').find((n) => n.label === 'OrderService.create');
    assert.ok(target);
    const lineage = adapter.lineage(target.id, 20);
    const nodeById = new Map(lineage.nodes.map((n) => [n.id, n]));
    const best = pickBestLineagePath(lineage.paths, 'upstream', nodeById);
    assert.ok(best);
    assert.ok(best.nodeIds.some((id) => nodeById.get(id)?.kind === 'http_endpoint'));
  });
});
