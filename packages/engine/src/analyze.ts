import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import { buildCodeTracrGraph } from './graph/codetracr-model.ts';
import { parseFixture } from './parser/treesitter.ts';
import type { CodeTracrGraph, ParsedFile } from './types.ts';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function provenanceReport(graph: CodeTracrGraph): unknown {
  const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.name]));
  return {
    edges: graph.edges.map((edge) => ({
      from: nodeNames.get(edge.from) ?? edge.from,
      to: nodeNames.get(edge.to) ?? edge.to,
      type: edge.type,
      treesitter: edge.provenance.evidence.some((item) => item.provider === 'treesitter'),
      derivation: edge.provenance.derivation,
      confidence: edge.provenance.confidence,
      certainty: edge.provenance.certainty,
    })),
    unresolved: graph.unresolved,
  };
}

function factsSummary(files: ParsedFile[]): unknown {
  const kindCounts: Record<string, number> = {};
  for (const file of files) {
    for (const fact of file.facts) {
      kindCounts[fact.kind] = (kindCounts[fact.kind] ?? 0) + 1;
    }
  }
  return {
    fileCount: files.length,
    factCount: Object.values(kindCounts).reduce((a, b) => a + b, 0),
    kindCounts,
    files: files.map((file) => ({ file: file.file, factCount: file.facts.length })),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  try {
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }

  // Stream large graphs without building one giant string.
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as CodeTracrGraph).nodes) &&
    Array.isArray((value as CodeTracrGraph).edges)
  ) {
    const graph = value as CodeTracrGraph;
    const stream = createWriteStream(path, { encoding: 'utf8' });
    stream.write('{"nodes":[');
    for (let i = 0; i < graph.nodes.length; i += 1) {
      if (i > 0) stream.write(',');
      stream.write(JSON.stringify(graph.nodes[i]));
    }
    stream.write('],"edges":[');
    for (let i = 0; i < graph.edges.length; i += 1) {
      if (i > 0) stream.write(',');
      stream.write(JSON.stringify(graph.edges[i]));
    }
    stream.write('],"unresolved":');
    stream.write(JSON.stringify(graph.unresolved ?? []));
    stream.write('}\n');
    stream.end();
    await finished(stream);
    return;
  }

  throw new Error(`Output too large to serialize: ${path}`);
}

const sourceRoot = resolve(argValue('--source') ?? argValue('-s') ?? '');
const outDir = resolve(
  argValue('--out') ?? argValue('-o') ?? resolve(sourceRoot, '..', 'codetracr-out'),
);
const writeFullFacts = hasFlag('--write-facts');

if (!sourceRoot || sourceRoot === resolve('') || !existsSync(sourceRoot)) {
  console.error(`Usage:
  node --experimental-strip-types packages/engine/src/analyze.ts --source <dir> --out <dir> [--write-facts]

Examples:
  npm run analyze -- --source fixtures/golden-poc/src --out generated/golden`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const started = performance.now();

const parseStarted = performance.now();
const parsedFiles = parseFixture(sourceRoot);
const parseMs = performance.now() - parseStarted;

if (parsedFiles.length === 0) {
  console.error(`No supported TypeScript/JavaScript files could be parsed under ${sourceRoot}`);
  process.exit(1);
}

const buildStarted = performance.now();
const graph = buildCodeTracrGraph(parsedFiles);
const buildMs = performance.now() - buildStarted;

await writeJson(
  resolve(outDir, 'treesitter-facts.json'),
  writeFullFacts ? { files: parsedFiles } : factsSummary(parsedFiles),
);
await writeJson(resolve(outDir, 'codetracr-graph.json'), graph);
await writeJson(resolve(outDir, 'provenance-report.json'), provenanceReport(graph));

const totalMs = performance.now() - started;
const semantic = {
  endpoints: graph.nodes.filter((n) => n.type === 'HTTP_ENDPOINT').length,
  tables: graph.nodes.filter((n) => n.type === 'DATABASE_TABLE').length,
  topics: graph.nodes.filter((n) => n.type === 'EVENT_TOPIC').length,
};

console.log('CodeTracr analyze');
console.log(`  source: ${sourceRoot}`);
console.log(`  out:    ${outDir}`);
console.log(`  files:  ${parsedFiles.length}`);
console.log(`  codetracr nodes/edges: ${graph.nodes.length}/${graph.edges.length}`);
console.log(`  semantic: ${semantic.endpoints} endpoints, ${semantic.tables} tables, ${semantic.topics} topics`);
console.log(`  unresolved: ${graph.unresolved.length}`);
console.log(
  `  timing: parse ${Math.round(parseMs)}ms · build ${Math.round(buildMs)}ms · total ${Math.round(totalMs)}ms`,
);
console.log(
  `  facts file: ${writeFullFacts ? 'full' : 'summary only (pass --write-facts for full dump)'}`,
);
