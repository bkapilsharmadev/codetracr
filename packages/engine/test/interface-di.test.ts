import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseTypeScriptSource } from '../src/parser/treesitter.ts';
import type { CodeTracrGraph } from '../src/types.ts';
import { loadFixtureGraph } from './load-fixture-graph.ts';

import { fixturesRoot } from '../src/poc-fixtures.ts';

const expected = JSON.parse(
  readFileSync(resolve(fixturesRoot, 'interface-di-poc', 'expected-graph.json'), 'utf8'),
) as {
  requiredNodes: Array<{ id: string; type: string }>;
  requiredEdges: Array<{ from: string; to: string; type: string }>;
  forbiddenEdges: Array<{ from: string; to: string; type: string }>;
};
const { graph: generated } = loadFixtureGraph('interface-di-poc/src');

function hasEdge(
  graph: CodeTracrGraph,
  edge: { from: string; to: string; type: string },
): boolean {
  return graph.edges.some(
    (candidate) =>
      candidate.from === edge.from &&
      candidate.to === edge.to &&
      candidate.type === edge.type,
  );
}

describe('interface and dependency-injection golden POC', () => {
  it('contains the required typed nodes and relationships', () => {
    for (const node of expected.requiredNodes) {
      assert.ok(
        generated.nodes.some(
          (candidate) => candidate.id === node.id && candidate.type === node.type,
        ),
        `Missing node ${node.id}`,
      );
    }
    for (const edge of expected.requiredEdges) {
      assert.ok(hasEdge(generated, edge), `Missing ${edge.from} -[${edge.type}]-> ${edge.to}`);
    }
  });

  it('does not dispatch to an implementation that was never injected', () => {
    for (const edge of expected.forbiddenEdges) {
      assert.ok(!hasEdge(generated, edge), `False positive ${edge.from} -[${edge.type}]-> ${edge.to}`);
    }
  });

  it('records Tree-sitter evidence for its calls and implements edges', () => {
    for (const type of ['CALLS', 'IMPLEMENTS']) {
      assert.ok(
        generated.edges.some(
          (edge) =>
            edge.type === type &&
            edge.provenance.evidence.some((item) => item.provider === 'treesitter'),
        ),
        `Expected Tree-sitter evidence for ${type}`,
      );
    }
  });

  it('stops at the interface method when no composition root is visible', () => {
    const files = [
      parseTypeScriptSource(
        `export interface Repository { save(value: any): Promise<void>; }`,
        'src/repository.ts',
      ),
      parseTypeScriptSource(
        `
          import { Repository } from "./repository";
          export class PostgresRepository implements Repository {
            async save(value: any): Promise<void> { void value; }
          }`,
        'src/postgres.ts',
      ),
      parseTypeScriptSource(
        `
          import { Repository } from "./repository";
          export class Service {
            constructor(private repository: Repository) {}
            async run(value: any) { await this.repository.save(value); }
          }`,
        'src/service.ts',
      ),
    ];
    const graph = buildCodeTracrGraph(files);
    assert.ok(
      hasEdge(graph, {
        from: 'method:src/service.ts#Service.run',
        to: 'method:src/repository.ts#Repository.save',
        type: 'CALLS',
      }),
    );
    assert.equal(graph.edges.filter((edge) => edge.type === 'INJECTED_WITH').length, 0);
    assert.equal(graph.edges.filter((edge) => edge.type === 'RESOLVES_TO').length, 0);
  });
});
