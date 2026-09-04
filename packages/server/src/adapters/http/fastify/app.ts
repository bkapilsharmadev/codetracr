import Fastify, { type FastifyInstance } from 'fastify';
import type { GraphRepository } from '../../../ports/GraphRepository.ts';
import { GraphService } from '../../../application/graph-service.ts';
import { registerMetaRoutes } from './routes/meta.ts';
import { registerNodeRoutes } from './routes/nodes.ts';
import { registerUiRoutes } from './routes/ui.ts';

export interface AppConfig {
  repoRoot: string;
  webRoot: string;
  graphPath: string;
  sourceRoot: string;
  editorScheme: string;
}

export interface BuildAppOptions {
  repository: GraphRepository;
  config: AppConfig;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const graph = new GraphService(options.repository);

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') {
      reply.header('access-control-allow-origin', '*');
      reply.header('access-control-allow-methods', 'GET, OPTIONS');
      reply.header('access-control-allow-headers', 'content-type');
      return reply.code(204).send();
    }
    if (req.method !== 'GET') {
      return reply.code(405).send({ error: 'method not allowed' });
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('access-control-allow-origin', '*');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      return reply.code(405).send({ error: 'method not allowed' });
    }
    const path = (req.raw.url ?? req.url).split('?')[0];
    return reply.code(404).send({ error: 'not found', path });
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (reply.sent) return;
    const status =
      typeof err === 'object' && err && 'statusCode' in err ? Number(err.statusCode) : undefined;
    const message = err instanceof Error ? err.message : String(err);
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: message });
    }
    return reply.code(500).send({ error: message });
  });

  await registerMetaRoutes(app, {
    repoRoot: options.config.repoRoot,
    sourceRoot: options.config.sourceRoot,
    graphPath: options.config.graphPath,
    editorScheme: options.config.editorScheme,
  });
  await registerUiRoutes(app, options.config.webRoot);
  await registerNodeRoutes(app, { graph });

  return app;
}
