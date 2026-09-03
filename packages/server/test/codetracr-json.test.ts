import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadCodeTracrJsonAdapter } from '../src/adapters/codetracr-json.ts';
import { resolveCodeTracrSourceRoot } from '../src/paths.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('CodeTracr JSON adapter', () => {
  it('loads the canonical Kafka graph without changing its semantic labels', () => {
    const graphPath = join(
      repoRoot,
      'packages',
      'engine',
      'generated',
      'kafka',
      'codetracr-graph.json',
    );
    const adapter = loadCodeTracrJsonAdapter(graphPath);
    assert.equal(adapter.id, 'codetracr');

    const topic = adapter.search('orders.created').find((node) => node.label === 'orders.created');
    assert.ok(topic);
    assert.equal(topic.kind, 'event_topic');

    const lineage = adapter.lineage(topic.id, 10);
    assert.ok(
      lineage.edges.some(
        (edge) => edge.relation === 'PUBLISHES' && edge.to === topic.id,
      ),
    );
    assert.ok(
      lineage.edges.some(
        (edge) => edge.relation === 'CONSUMED_BY' && edge.from === topic.id,
      ),
    );
    assert.ok(
      lineage.nodes.some((node) => node.label === 'OrderEventPublisher.publish'),
    );
    assert.ok(
      lineage.nodes.some((node) => node.label === 'OrderCreatedConsumer.handle'),
    );
  });

  it('preserves possible certainty and numeric confidence', () => {
    const graphPath = join(
      repoRoot,
      'packages',
      'engine',
      'generated',
      'factory',
      'codetracr-graph.json',
    );
    const adapter = loadCodeTracrJsonAdapter(graphPath);
    const dynamic = adapter
      .search('DynamicOrderService.create')
      .find((node) => node.label === 'DynamicOrderService.create');
    assert.ok(dynamic);

    const lineage = adapter.lineage(dynamic.id, 10);
    const possible = lineage.edges.filter(
      (edge) => edge.relation === 'POSSIBLE_RESOLUTION',
    );
    assert.equal(possible.length, 2);
    assert.ok(
      possible.every(
        (edge) =>
          edge.certainty === 'POSSIBLE' &&
          edge.confidenceScore === 1 &&
          edge.confidence === 'INFERRED' &&
          edge.raw.provenance != null,
      ),
    );
  });

  it('infers the Kafka fixture source root from a generated graph path', () => {
    const graphPath = join(
      repoRoot,
      'packages',
      'engine',
      'generated',
      'kafka',
      'codetracr-graph.json',
    );
    assert.equal(
      resolveCodeTracrSourceRoot(repoRoot, graphPath),
      join(repoRoot, 'packages', 'engine', 'kafka-poc'),
    );
  });
});
