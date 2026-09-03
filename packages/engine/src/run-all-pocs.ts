import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCodeTracrGraph } from './graph/codetracr-model.ts';
import { generatedRoot, parseAllPocFixtures } from './poc-fixtures.ts';

const outRoot = resolve(generatedRoot, 'all');

function writeJson(name: string, value: unknown): void {
  writeFileSync(resolve(outRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(outRoot, { recursive: true });
const parsedFiles = parseAllPocFixtures();
const graph = buildCodeTracrGraph(parsedFiles);
const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.name]));

writeJson('codetracr-graph.json', graph);
writeJson('provenance-report.json', {
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
});

console.log('CodeTracr combined POC fixtures');
console.log(`  Tree-sitter: ${parsedFiles.length} files parsed`);
console.log(`  CodeTracr: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
