import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCodeTracrGraph } from './graph/codetracr-model.ts';
import { parseFixture } from './parser/treesitter.ts';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'factory-poc', 'src');
const generatedRoot = resolve(root, 'generated', 'factory');

function writeJson(name: string, value: unknown): void {
  writeFileSync(resolve(generatedRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(generatedRoot, { recursive: true });
const parsedFiles = parseFixture(sourceRoot);
const graph = buildCodeTracrGraph(parsedFiles);
const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.name]));

writeJson('treesitter-facts.json', { files: parsedFiles });
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
    evidence: edge.provenance.evidence,
  })),
  unresolved: graph.unresolved,
});

console.log('CodeTracr conditional factory POC');
console.log(`  Tree-sitter: ${parsedFiles.length} TypeScript files parsed`);
console.log(`  CodeTracr: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
console.log(
  `  Definite resolutions: ${graph.edges.filter((edge) => edge.type === 'RESOLVES_TO').length}`,
);
console.log(
  `  Possible resolutions: ${graph.edges.filter((edge) => edge.type === 'POSSIBLE_RESOLUTION').length}`,
);
