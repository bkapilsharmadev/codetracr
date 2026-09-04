import type { GraphRepository } from '../../ports/GraphRepository.ts';
import { JsonGraphRepository } from './json/JsonGraphRepository.ts';

export type GraphStorageKind = 'json';

export interface GraphRepositoryOptions {
  kind?: GraphStorageKind;
  graphPath: string;
}

/** Swap `kind` later for sqlite / postgres / neo4j without touching routes or GraphService. */
export function createGraphRepository(options: GraphRepositoryOptions): GraphRepository {
  const kind = options.kind ?? 'json';
  if (kind === 'json') return JsonGraphRepository.load(options.graphPath);
  throw new Error(`Unsupported graph storage: ${String(kind)}`);
}
