import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseAllPocFixtures } from '../src/poc-fixtures.ts';

describe('combined POC fixtures', () => {
  it('keeps golden HTTP/SQL and Kafka symbols in one graph without name collisions', () => {
    const graph = buildCodeTracrGraph(parseAllPocFixtures());
    const names = new Set(graph.nodes.map((node) => node.name));
    assert.ok(names.has('OrderService.create'));
    assert.ok(names.has('OrderEventPublisher.publish'));
    assert.ok(names.has('POST /api/v1/orders'));
    assert.ok(names.has('orders.created'));
    assert.ok(
      graph.nodes.some((node) => node.file?.startsWith('golden-poc/src/')),
    );
    assert.ok(
      graph.nodes.some((node) => node.file?.startsWith('kafka-poc/src/')),
    );
  });
});
