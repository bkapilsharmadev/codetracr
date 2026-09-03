import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseTypeScriptSource } from '../src/parser/treesitter.ts';
import { loadFixtureGraph } from './load-fixture-graph.ts';
import type { CodeTracrGraph } from '../src/types.ts';

const root = resolve(import.meta.dirname, '..');
const expected = JSON.parse(
  readFileSync(resolve(root, 'kafka-poc', 'expected-graph.json'), 'utf8'),
) as {
  requiredNodes: Array<{ id: string; type: string }>;
  requiredEdges: Array<{ from: string; to: string; type: string }>;
  forbiddenEdges: Array<{ from: string; to: string; type: string }>;
};
const { graph } = loadFixtureGraph('kafka-poc/src');

function hasEdge(
  graph: CodeTracrGraph,
  expectedEdge: { from: string; to: string; type: string },
): boolean {
  return graph.edges.some(
    (edge) =>
      edge.from === expectedEdge.from &&
      edge.to === expectedEdge.to &&
      edge.type === expectedEdge.type,
  );
}

describe('Kafka event-flow golden POC', () => {
  it('connects the publisher to the matching consumer through the topic', () => {
    for (const node of expected.requiredNodes) {
      assert.ok(
        graph.nodes.some(
          (candidate) => candidate.id === node.id && candidate.type === node.type,
        ),
        `Missing topic ${node.id}`,
      );
    }
    for (const edge of expected.requiredEdges) {
      assert.ok(hasEdge(graph, edge), `Missing ${edge.from} -[${edge.type}]-> ${edge.to}`);
    }
  });

  it('does not connect unrelated send methods or different topics', () => {
    for (const edge of expected.forbiddenEdges) {
      assert.ok(!hasEdge(graph, edge), `False positive ${edge.from} -[${edge.type}]-> ${edge.to}`);
    }
  });

  it('keeps Kafka semantics as Tree-sitter semantic rules', () => {
    for (const edge of graph.edges.filter((candidate) =>
      ['PUBLISHES', 'CONSUMED_BY'].includes(candidate.type),
    )) {
      assert.equal(edge.provenance.derivation.rule, 'kafka-event');
      assert.equal(edge.provenance.certainty, 'DEFINITE');
      assert.ok(edge.provenance.evidence.every((item) => item.provider === 'treesitter'));
    }
  });

  it('does not invent a topic when its value is environment-dependent', () => {
    const files = [
      parseTypeScriptSource(
        `
          import type { Producer } from "kafkajs";
          export class DynamicPublisher {
            constructor(private producer: Producer) {}
            async publish(value: any) {
              await this.producer.send({
                topic: process.env.KAFKA_TOPIC,
                messages: [{ value }]
              });
            }
          }`,
        'src/dynamic-publisher.ts',
      ),
    ];
    const result = buildCodeTracrGraph(files);
    assert.equal(result.nodes.filter((node) => node.type === 'EVENT_TOPIC').length, 0);
    assert.equal(result.edges.filter((edge) => edge.type === 'PUBLISHES').length, 0);
  });
});
