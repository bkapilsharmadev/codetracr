export function parseDepth(raw: string | undefined): number {
  if (!raw || raw === '0' || raw.toLowerCase() === 'unlimited') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? String(fallback));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function requireAnalyzer(raw: string | undefined): void {
  const id = raw ?? 'codetracr';
  if (id !== 'codetracr') throw new Error(`Unknown analyzer: ${id}`);
}
