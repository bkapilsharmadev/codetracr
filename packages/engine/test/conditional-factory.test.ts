import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { loadFixtureGraph } from './load-fixture-graph.ts';
import type { CodeTracrGraph } from '../src/types.ts';

import { fixturesRoot } from '../src/poc-fixtures.ts';

const expected = JSON.parse(
  readFileSync(resolve(fixturesRoot, 'factory-poc', 'expected-graph.json'), 'utf8'),
) as {
  requiredEdges: Array<{
    from: string;
    to: string;
    type: string;
    certainty: string;
  }>;
  forbiddenEdges: Array<{ from: string; to: string; type: string }>;
};
const { graph } = loadFixtureGraph('factory-poc/src');

function edgeMatches(
  edge: CodeTracrGraph['edges'][number],
  expectedEdge: { from: string; to: string; type: string },
): boolean {
  return (
    edge.from === expectedEdge.from &&
    edge.to === expectedEdge.to &&
    edge.type === expectedEdge.type
  );
}

describe('conditional factory golden POC', () => {
  it('selects the statically known Postgres branch definitively', () => {
    for (const required of expected.requiredEdges.filter(
      (edge) => edge.certainty === 'DEFINITE',
    )) {
      const edge = graph.edges.find((candidate) => edgeMatches(candidate, required));
      assert.ok(edge, `Missing definite edge ${required.from} -[${required.type}]-> ${required.to}`);
      assert.equal(edge.provenance.certainty, 'DEFINITE');
      assert.equal(edge.provenance.confidence, 1);
    }
  });

  it('keeps environment-driven branches possible rather than probabilistic', () => {
    const possible = expected.requiredEdges.filter((edge) => edge.certainty === 'POSSIBLE');
    assert.equal(possible.length, 2);
    for (const required of possible) {
      const edge = graph.edges.find((candidate) => edgeMatches(candidate, required));
      assert.ok(edge, `Missing possible edge ${required.from} -> ${required.to}`);
      assert.equal(edge.provenance.certainty, 'POSSIBLE');
      assert.equal(edge.provenance.confidence, 1);
      assert.equal(edge.provenance.derivation.rule, 'conditional-factory-analysis');
    }
  });

  it('never selects implementations absent from factory return paths', () => {
    for (const forbidden of expected.forbiddenEdges) {
      assert.ok(
        !graph.edges.some((candidate) => edgeMatches(candidate, forbidden)),
        `False positive ${forbidden.from} -[${forbidden.type}]-> ${forbidden.to}`,
      );
    }
  });
});
