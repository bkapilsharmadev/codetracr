import type { GraphNode } from './query-model.ts';

export const UNLIMITED_DEPTH = 0;

/** true = hide noise in lineage/traces; false = show full graph (default for explorer) */
export const NOISE_GATE_ENABLED = false;

const NOISE_LABELS = new Set(
  [
    'randomUUID',
    'trim',
    'toUpperCase',
    'toLowerCase',
    'JSON.parse',
    'JSON.stringify',
    'Object.assign',
    'Promise',
    'then',
    'catch',
    'finally',
    'constructor',
    'query',
    'connect',
    'disconnect',
    'listen',
    'register',
    'inject',
    'send',
    'end',
    'code',
    'status',
    'log',
    'error',
    'warn',
    'info',
    'buildApp',
    'start',
    'server',
    'Fastify',
    'Kafka',
    'Producer',
    'Consumer',
  ].map((label) => label.toLowerCase()),
);

function isNoiseFile(file: string): boolean {
  const lower = file.replaceAll('\\', '/').toLowerCase();
  return (
    lower.includes('node_modules') ||
    lower.includes('vitest') ||
    lower.includes('fastify/lib') ||
    lower.endsWith('server.ts')
  );
}

export function isNoiseNode(node: GraphNode | undefined): boolean {
  if (!node) return true;
  if (!NOISE_GATE_ENABLED) return false;
  if (node.kind === 'import' || node.kind === 'type' || node.kind === 'file' || node.kind === 'module') {
    return true;
  }
  const plain = plainLabel(node.label).toLowerCase();
  if (NOISE_LABELS.has(plain)) return true;
  if (plain.endsWith('.ts') || plain.endsWith('.js')) return true;
  if (node.file && isNoiseFile(node.file)) return true;
  return false;
}

export function formatNodeLabel(node: GraphNode): string {
  const plain = plainLabel(node.label);
  const file = node.file?.split(/[/\\]/).pop();
  return file ? `${plain} (${file})` : plain;
}

export function plainLabel(label: string): string {
  let plain = label;
  if (plain.startsWith('.')) plain = plain.slice(1);
  if (plain.endsWith('()')) plain = plain.slice(0, -2);
  return plain;
}
