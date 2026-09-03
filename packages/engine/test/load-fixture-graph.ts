import { resolve } from 'node:path';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseFixture } from '../src/parser/treesitter.ts';
import type { CodeTracrGraph, ParsedFile } from '../src/types.ts';

const engineRoot = resolve(import.meta.dirname, '..');

export function loadFixtureGraph(relativeSource: string): {
  files: ParsedFile[];
  graph: CodeTracrGraph;
} {
  const files = parseFixture(resolve(engineRoot, relativeSource));
  return { files, graph: buildCodeTracrGraph(files) };
}
