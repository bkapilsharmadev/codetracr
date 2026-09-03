import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

export function resolveCodeTracrGraphPath(repoRoot: string): string {
  const fromEnv = process.env.CODETRACR_GRAPH;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(`CODETRACR_GRAPH does not exist: ${fromEnv}`);
  }
  const generatedRoot = join(repoRoot, 'generated');
  const candidates = [
    join(generatedRoot, 'all', 'codetracr-graph.json'),
    join(generatedRoot, 'kafka', 'codetracr-graph.json'),
    join(generatedRoot, 'factory', 'codetracr-graph.json'),
    join(generatedRoot, 'interface-di', 'codetracr-graph.json'),
    join(generatedRoot, 'golden', 'codetracr-graph.json'),
  ];
  const graph = candidates.find(existsSync);
  if (graph) return graph;
  throw new Error('CodeTracr graph not found. Run npm run poc first.');
}

export function resolveCodeTracrSourceRoot(repoRoot: string, graphPath: string): string {
  const fromEnv = process.env.CODETRACR_SOURCE_ROOT;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(`CODETRACR_SOURCE_ROOT does not exist: ${fromEnv}`);
  }
  const fixturesRoot = join(repoRoot, 'fixtures');
  const normalized = normalize(graphPath).toLowerCase();
  if (normalized.includes(normalize(join('generated', 'all')).toLowerCase())) {
    return fixturesRoot;
  }
  const byGraph: Array<[string, string]> = [
    [normalize(join('generated', 'kafka')).toLowerCase(), 'kafka-poc'],
    [normalize(join('generated', 'factory')).toLowerCase(), 'factory-poc'],
    [normalize(join('generated', 'interface-di')).toLowerCase(), 'interface-di-poc'],
    [normalize(join('generated', 'golden')).toLowerCase(), 'golden-poc'],
  ];
  for (const [fragment, fixture] of byGraph) {
    const root = join(fixturesRoot, fixture);
    if (normalized.includes(fragment) && existsSync(root)) return root;
  }
  const golden = join(fixturesRoot, 'golden-poc');
  return existsSync(golden) ? golden : repoRoot;
}
