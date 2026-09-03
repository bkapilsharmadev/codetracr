import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

export function resolveCodeTracrGraphPath(repoRoot: string): string {
  const fromEnv = process.env.CODETRACR_GRAPH;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(`CODETRACR_GRAPH does not exist: ${fromEnv}`);
  }
  const engineRoot = join(repoRoot, 'packages', 'engine');
  const candidates = [
    join(engineRoot, 'generated', 'kafka', 'codetracr-graph.json'),
    join(engineRoot, 'generated', 'factory', 'codetracr-graph.json'),
    join(engineRoot, 'generated', 'interface-di', 'codetracr-graph.json'),
    join(engineRoot, 'generated', 'codetracr-graph.json'),
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
  const engineRoot = join(repoRoot, 'packages', 'engine');
  const normalized = normalize(graphPath).toLowerCase();
  const fixtures: Array<[string, string]> = [
    [normalize(join('generated', 'kafka')).toLowerCase(), 'kafka-poc'],
    [normalize(join('generated', 'factory')).toLowerCase(), 'factory-poc'],
    [normalize(join('generated', 'interface-di')).toLowerCase(), 'interface-di-poc'],
  ];
  for (const [fragment, fixture] of fixtures) {
    const root = join(engineRoot, fixture);
    if (normalized.includes(fragment) && existsSync(root)) return root;
  }
  const golden = join(engineRoot, 'golden-poc');
  return existsSync(golden) ? golden : repoRoot;
}
