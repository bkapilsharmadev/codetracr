import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './parser/treesitter.ts';
import { buildCodeTracrGraph } from './graph/codetracr-model.ts';
import type { CodeTracrGraph } from './types.ts';

const root = resolve(import.meta.dirname, '..');
const fixtureRoot = resolve(root, 'golden-poc');
const sourceRoot = resolve(fixtureRoot, 'src');
const generatedRoot = resolve(root, 'generated');

function writeJson(name: string, value: unknown): void {
  writeFileSync(resolve(generatedRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

function provenanceReport(graph: CodeTracrGraph): unknown {
  const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.name]));
  return {
    edges: graph.edges
      .filter((edge) => edge.type !== 'IMPORTS')
      .map((edge) => ({
        from: nodeNames.get(edge.from) ?? edge.from,
        to: nodeNames.get(edge.to) ?? edge.to,
        type: edge.type,
        treesitter: edge.provenance.evidence.some((item) => item.provider === 'treesitter'),
        semanticResolution: edge.provenance.derivation.kind !== 'syntax',
        semanticRule:
          edge.provenance.derivation.rule ?? edge.provenance.derivation.kind,
        confidence: edge.provenance.confidence,
        certainty: edge.provenance.certainty,
        evidence: edge.provenance.evidence,
      })),
    unresolved: graph.unresolved,
  };
}

mkdirSync(generatedRoot, { recursive: true });
const parsedFiles = parseFixture(sourceRoot);
const graph = buildCodeTracrGraph(parsedFiles);

writeJson('treesitter-facts.json', { files: parsedFiles });
writeJson('codetracr-graph.json', graph);
writeJson('provenance-report.json', provenanceReport(graph));

const semanticNodes = graph.nodes.filter(
  (node) => node.type === 'HTTP_ENDPOINT' || node.type === 'DATABASE_TABLE',
);
console.log('CodeTracr semantic graph POC');
console.log(`  Tree-sitter: ${parsedFiles.length} TypeScript files parsed`);
console.log(`  CodeTracr: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
console.log(`  Semantic nodes: ${semanticNodes.map((node) => node.name).join(', ')}`);
console.log(`  Unresolved calls: ${graph.unresolved.length}`);
