import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { JsonGraphRepository } from '../src/adapters/persistence/json/JsonGraphRepository.ts';
import { GraphService } from '../src/application/graph-service.ts';
import { resolveCodeTracrSourceRoot } from '../src/paths.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function serviceFrom(graphRel: string) {
  const graphPath = join(repoRoot, ...graphRel.split('/'));
  return new GraphService(JsonGraphRepository.load(graphPath));
}

describe('CodeTracr JSON repository', () => {
  it('loads the canonical Kafka graph without changing its semantic labels', async () => {
    const graph = serviceFrom('generated/kafka/codetracr-graph.json');
    assert.equal(graph.analyzerId, 'codetracr');

    const topic = (await graph.search('orders.created')).find((node) => node.label === 'orders.created');
    assert.ok(topic);
    assert.equal(topic.kind, 'event_topic');

    const lineage = await graph.lineage(topic.id, 10);
    assert.ok(
      lineage.edges.some((edge) => edge.relation === 'PUBLISHES' && edge.to === topic.id),
    );
    assert.ok(
      lineage.edges.some((edge) => edge.relation === 'CONSUMED_BY' && edge.from === topic.id),
    );
    assert.ok(lineage.nodes.some((node) => node.label === 'OrderEventPublisher.publish'));
    assert.ok(lineage.nodes.some((node) => node.label === 'OrderCreatedConsumer.handle'));
  });

  it('preserves possible certainty and numeric confidence', async () => {
    const graph = serviceFrom('generated/factory/codetracr-graph.json');
    const dynamic = (await graph.search('DynamicOrderService.create')).find(
      (node) => node.label === 'DynamicOrderService.create',
    );
    assert.ok(dynamic);

    const lineage = await graph.lineage(dynamic.id, 10);
    const possible = lineage.edges.filter((edge) => edge.relation === 'POSSIBLE_RESOLUTION');
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
    const graphPath = join(repoRoot, 'generated', 'kafka', 'codetracr-graph.json');
    assert.equal(
      resolveCodeTracrSourceRoot(repoRoot, graphPath),
      join(repoRoot, 'fixtures', 'kafka-poc'),
    );
  });

  it('infers the fixtures directory for the combined POC graph', () => {
    const graphPath = join(repoRoot, 'generated', 'all', 'codetracr-graph.json');
    assert.equal(resolveCodeTracrSourceRoot(repoRoot, graphPath), join(repoRoot, 'fixtures'));
  });
});
