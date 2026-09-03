import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { loadFixtureGraph } from './load-fixture-graph.ts';

import { fixturesRoot } from '../src/poc-fixtures.ts';

const expected = JSON.parse(
  readFileSync(resolve(fixturesRoot, 'golden-poc', 'expected-graph.json'), 'utf8'),
) as {
  requiredNodes: Array<{ id: string; type: string; name: string }>;
  requiredEdges: Array<{ from: string; to: string; type: string }>;
  forbiddenEdges: Array<{ from: string; to: string }>;
};
const { files, graph } = loadFixtureGraph('golden-poc/src');

describe('CodeTracr semantic golden POC', () => {
  it('contains every required semantic node', () => {
    for (const required of expected.requiredNodes) {
      assert.ok(
        graph.nodes.some(
          (node) =>
            node.id === required.id && node.type === required.type && node.name === required.name,
        ),
        `Missing node ${required.id}`,
      );
    }
  });

  it('contains every required semantic relationship', () => {
    for (const required of expected.requiredEdges) {
      assert.ok(
        graph.edges.some(
          (edge) =>
            edge.from === required.from &&
            edge.to === required.to &&
            edge.type === required.type,
        ),
        `Missing edge ${required.from} -[${required.type}]-> ${required.to}`,
      );
    }
  });

  it('does not connect the same-named negative control', () => {
    assert.ok(
      graph.nodes.some(
        (node) => node.id === 'method:src/local-utility.ts#LocalUtility.create',
      ),
    );
    for (const forbidden of expected.forbiddenEdges) {
      assert.ok(
        !graph.edges.some(
          (edge) => edge.from === forbidden.from && edge.to === forbidden.to,
        ),
        `False positive edge ${forbidden.from} -> ${forbidden.to}`,
      );
    }
  });

  it('parses every fixture TypeScript file and normalizes required fact kinds', () => {
    assert.deepEqual(
      files.map((file) => file.file).sort(),
      [
        'src/app.ts',
        'src/controller.ts',
        'src/database.ts',
        'src/local-utility.ts',
        'src/repository.ts',
        'src/routes.ts',
        'src/service.ts',
      ],
    );
    const kinds = new Set(files.flatMap((file) => file.facts.map((fact) => fact.kind)));
    const requiredKinds = [
      'IMPORT',
      'EXPORT',
      'CLASS',
      'CLASS_PROPERTY',
      'METHOD',
      'FUNCTION',
      'VARIABLE',
      'CALL',
      'MEMBER',
      'NEW',
      'STRING',
      'OBJECT',
      'ARGUMENT',
      'TYPE_ANNOTATION',
    ] as const;
    for (const kind of requiredKinds) {
      assert.ok(kinds.has(kind), `Missing normalized Tree-sitter fact kind ${kind}`);
    }
  });
});
