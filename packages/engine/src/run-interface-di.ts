import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCodeTracrGraph } from './graph/codetracr-model.ts';
import { parseFixture } from './parser/treesitter.ts';

const root = resolve(import.meta.dirname, '..');
const fixtureRoot = resolve(root, 'interface-di-poc');
const sourceRoot = resolve(fixtureRoot, 'src');
const generatedRoot = resolve(root, 'generated', 'interface-di');

function writeJson(name: string, value: unknown): void {
  writeFileSync(resolve(generatedRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(generatedRoot, { recursive: true });
const parsedFiles = parseFixture(sourceRoot);
const graph = buildCodeTracrGraph(parsedFiles);
const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.name]));
const provenanceReport = {
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
};

writeJson('treesitter-facts.json', { files: parsedFiles });
writeJson('codetracr-graph.json', graph);
writeJson('provenance-report.json', provenanceReport);

console.log('CodeTracr interface/DI POC');
console.log(`  Tree-sitter: ${parsedFiles.length} TypeScript files parsed`);
console.log(`  CodeTracr: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
console.log(
  `  DI edges: ${graph.edges.filter((edge) => ['DEPENDS_ON', 'IMPLEMENTS', 'INJECTED_WITH', 'RESOLVES_TO'].includes(edge.type)).length}`,
);
console.log(`  Unresolved calls: ${graph.unresolved.length}`);
