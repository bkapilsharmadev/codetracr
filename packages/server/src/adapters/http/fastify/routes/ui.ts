import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

function sendStatic(webRoot: string, relativePath: string, reply: FastifyReply): boolean {
  const file = relativePath === '' || relativePath === '/' ? 'index.html' : relativePath.replace(/^\//, '');
  const full = join(webRoot, file);
  const normalizedRoot = webRoot.toLowerCase();
  const normalizedFull = full.toLowerCase();
  if (!normalizedFull.startsWith(normalizedRoot) || !existsSync(full)) return false;

  const ext = full.split('.').pop() ?? '';
  const body = readFileSync(full);
  void reply
    .type(TYPES[ext] ?? 'application/octet-stream')
    .send(body);
  return true;
}

export async function registerUiRoutes(app: FastifyInstance, webRoot: string): Promise<void> {
  app.get('/', async (_req, reply) => {
    if (sendStatic(webRoot, 'index.html', reply)) return;
    return reply.code(404).send({ error: 'not found', path: '/' });
  });

  app.get('/ui', async (_req, reply) => {
    if (sendStatic(webRoot, 'index.html', reply)) return;
    return reply.code(404).send({ error: 'not found', path: '/ui' });
  });

  app.get('/ui/', async (_req, reply) => {
    if (sendStatic(webRoot, 'index.html', reply)) return;
    return reply.code(404).send({ error: 'not found', path: '/ui/' });
  });

  app.get('/ui/*', async (req, reply) => {
    const rest = (req.params as { '*': string })['*'] ?? '';
    if (sendStatic(webRoot, rest, reply)) return;
    return reply.code(404).send({ error: 'not found', path: req.url.split('?')[0] });
  });
}
