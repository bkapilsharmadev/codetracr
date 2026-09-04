import type { FastifyInstance } from 'fastify';

export interface MetaRouteConfig {
  repoRoot: string;
  sourceRoot: string;
  graphPath: string;
  editorScheme: string;
}

export async function registerMetaRoutes(
  app: FastifyInstance,
  config: MetaRouteConfig,
): Promise<void> {
  app.get('/health', async () => ({ ok: true, analyzers: ['codetracr'] as const }));

  app.get('/config', async () => ({
    repoRoot: config.repoRoot,
    sourceRoot: config.sourceRoot,
    graphPath: config.graphPath,
    editorScheme: config.editorScheme,
  }));
}
