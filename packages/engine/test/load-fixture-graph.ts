import { resolve } from 'node:path';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseFixture } from '../src/parser/treesitter.ts';
import { fixturesRoot } from '../src/poc-fixtures.ts';
import type { CodeTracrGraph, ParsedFile } from '../src/types.ts';

export function loadFixtureGraph(relativeSource: string): {
  files: ParsedFile[];
  graph: CodeTracrGraph;
} {
  const files = parseFixture(resolve(fixturesRoot, relativeSource));
  return { files, graph: buildCodeTracrGraph(files) };
}
