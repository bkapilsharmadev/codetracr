import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseSource } from '../src/parser/treesitter.ts';

describe('PropBix semantic pattern families', () => {
  it('extracts registered Fastify plugins with options-object handlers', () => {
    const files = [
      parseSource(
        [
          "import Fastify from 'fastify';",
          "import { webhooksRoutes } from './routes.js';",
          "const prefix = '/api/v1';",
          'export function buildApp() {',
          '  const fastify = Fastify();',
          '  fastify.register(webhooksRoutes, { prefix });',
          '}',
        ].join('\n'),
        'src/app.js',
      ),
      parseSource(
        [
          "import { webhooksController } from './controller.js';",
          'export async function webhooksRoutes(fastify) {',
          "  fastify.post('/webhooks', { handler: webhooksController.create });",
          '}',
        ].join('\n'),
        'src/routes.js',
      ),
      parseSource(
        [
          'export const webhooksController = {',
          '  create: async (request, reply) => reply.send(request.body),',
          '};',
        ].join('\n'),
        'src/controller.js',
      ),
    ];

    const graph = buildCodeTracrGraph(files);
    assert.ok(
      graph.nodes.some(
        (node) => node.type === 'HTTP_ENDPOINT' && node.name === 'POST /api/v1/webhooks',
      ),
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'HANDLES' &&
          edge.to === 'function:src/controller.js#webhooksController.create',
      ),
    );
  });

  it('extracts TDAP writes only through a proven table registry', () => {
    const files = [
      parseSource(
        [
          'function defineTenantTable(value) { return value; }',
          'export const tenantTables = Object.freeze({',
          "  webhooks: defineTenantTable({ name: 'webhooks' }),",
          "  backgroundChecks: defineTenantTable({ name: 'background_checks' }),",
          '});',
        ].join('\n'),
        'src/tenant-tables.js',
      ),
      parseSource(
        [
          "import { tenantTables } from '@propbix/database/tenant-runtime-db';",
          'export class WebhooksRepository {',
          '  save(ctx, values) {',
          '    return this._tenantDb().insert(ctx, { table: tenantTables.webhooks, values });',
          '  }',
          '  findAll(ctx) {',
          '    return this._tenantDb().select(ctx, { table: tenantTables.webhooks });',
          '  }',
          '}',
        ].join('\n'),
        'src/webhooks.repository.js',
      ),
      parseSource(
        [
          'export class UnrelatedStore {',
          '  save(value) {',
          "    return this.client.insert({ table: 'webhooks', value });",
          '  }',
          '}',
        ].join('\n'),
        'src/unrelated.js',
      ),
    ];

    const graph = buildCodeTracrGraph(files);
    assert.ok(graph.nodes.some((node) => node.id === 'table:webhooks'));
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'WRITES' &&
          edge.from === 'method:src/webhooks.repository.js#WebhooksRepository.save' &&
          edge.to === 'table:webhooks',
      ),
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'READS' &&
          edge.from === 'method:src/webhooks.repository.js#WebhooksRepository.findAll' &&
          edge.to === 'table:webhooks',
      ),
    );
    assert.ok(
      !graph.edges.some(
        (edge) =>
          edge.type === 'WRITES' &&
          edge.from === 'method:src/unrelated.js#UnrelatedStore.save',
      ),
    );
  });
});
