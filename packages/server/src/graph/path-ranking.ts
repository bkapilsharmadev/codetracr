import type { GraphNode } from './types.ts';
import type { LineagePath } from './lineage.ts';
import { plainLabel } from './graph-utils.ts';

function pathScoreForFile(file: string, label: string): number {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  const fileName = normalized.split('/').pop() ?? '';
  const plain = label.toLowerCase();
  let score = 0;

  if (normalized.includes('/routes/') || normalized.includes('/route/') || normalized.includes('router')) {
    score += 5;
  }
  if (normalized.includes('controller') || normalized.includes('handler')) score += 4;
  if (normalized.includes('/services/') || normalized.includes('/service/')) score += 2;
  if (
    normalized.includes('/repositories/') ||
    normalized.includes('/repository/') ||
    normalized.includes('/dao/')
  ) {
    score += 1;
  }

  if (
    (fileName === 'app.ts' || fileName === 'app.js' || fileName === 'main.ts' || fileName === 'main.js' ||
      fileName === 'bootstrap.ts' || fileName === 'bootstrap.js') &&
    (plain.startsWith('build') || plain.startsWith('create') || plain.startsWith('bootstrap') ||
      plain.startsWith('setup'))
  ) {
    score -= 4;
  }
  if (
    (fileName === 'server.ts' || fileName === 'server.js') &&
    (plain === 'server' || plain === 'main' || plain === 'listen')
  ) {
    score -= 1;
  }

  return score;
}

/** Score a path using node file paths and labels — framework-agnostic layer heuristics. */
export function scorePathNodes(path: LineagePath, nodeById: Map<string, GraphNode>): number {
  const nodes = path.nodeIds
    .map((id) => nodeById.get(id))
    .filter((n): n is GraphNode => Boolean(n));
  let score = nodes.length;

  for (const node of nodes) {
    score += pathScoreForFile(node.file ?? '', plainLabel(node.label));
  }

  return score;
}

export function scorePathLabels(path: string[]): number {
  let score = path.length;
  for (const step of path) {
    const lower = step.toLowerCase();
    if (lower.includes('route') || lower.includes('router')) score += 3;
    if (lower.includes('controller') || lower.includes('handler')) score += 2;
    if (lower.includes('buildapp') || lower.includes('bootstrap') || lower.includes('createapp')) {
      score -= 3;
    }
  }
  return score;
}

export function rankLineagePaths(
  paths: LineagePath[],
  nodeById: Map<string, GraphNode>,
): LineagePath[] {
  return [...paths].sort((a, b) => {
    const scoreA = scorePathNodes(a, nodeById);
    const scoreB = scorePathNodes(b, nodeById);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.nodeIds.length - a.nodeIds.length;
  });
}

export function pickBestLineagePath(
  paths: LineagePath[],
  direction: 'upstream' | 'downstream',
  nodeById: Map<string, GraphNode>,
): LineagePath | undefined {
  const filtered = paths.filter((p) => p.direction === direction);
  if (!filtered.length) return undefined;
  return rankLineagePaths(filtered, nodeById)[0];
}
