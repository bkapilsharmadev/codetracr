import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, after } from 'node:test';
import { JsonGraphRepository } from '../src/adapters/persistence/json/JsonGraphRepository.ts';
import { buildApp } from '../src/adapters/http/fastify/app.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const graphPath = join(repoRoot, 'generated', 'kafka', 'codetracr-graph.json');
const webRoot = join(repoRoot, 'packages', 'web');

const app = await buildApp({
  repository: JsonGraphRepository.load(graphPath),
  config: {
    repoRoot,
    webRoot,
    graphPath,
    sourceRoot: join(repoRoot, 'fixtures', 'kafka-poc'),
    editorScheme: 'vscode',
  },
});

describe('HTTP API', () => {
  after(async () => {
    await app.close();
  });

  it('serves health and config', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { ok: true, analyzers: ['codetracr'] });

    const config = await app.inject({ method: 'GET', url: '/config' });
    assert.equal(config.statusCode, 200);
    const body = config.json();
    assert.equal(body.graphPath, graphPath);
    assert.equal(body.editorScheme, 'vscode');
  });

  it('searches nodes and returns callers of an encoded id', async () => {
    const search = await app.inject({ method: 'GET', url: '/nodes/search?q=orders.created&limit=20' });
    assert.equal(search.statusCode, 200);
    const hit = search.json().results.find((n: { label: string }) => n.label === 'orders.created');
    assert.ok(hit);

    const node = await app.inject({ method: 'GET', url: `/nodes/${encodeURIComponent(hit.id)}` });
    assert.equal(node.statusCode, 200);
    assert.equal(node.json().node.id, hit.id);

    const lineage = await app.inject({
      method: 'GET',
      url: `/nodes/${encodeURIComponent(hit.id)}/lineage?depth=10`,
    });
    assert.equal(lineage.statusCode, 200);
    const payload = lineage.json();
    assert.equal(payload.analyzer, 'codetracr');
    assert.ok(payload.edges.some((e: { relation: string }) => e.relation === 'CONSUMED_BY'));
    assert.ok(payload.edges.some((e: { relation: string }) => e.relation === 'PUBLISHES'));

    const callers = await app.inject({
      method: 'GET',
      url: `/nodes/${encodeURIComponent(hit.id)}/callers`,
    });
    assert.equal(callers.statusCode, 200);
    assert.ok(callers.json().edges.some((e: { relation: string }) => e.relation === 'PUBLISHES'));

    const callees = await app.inject({
      method: 'GET',
      url: `/nodes/${encodeURIComponent(hit.id)}/callees`,
    });
    assert.equal(callees.statusCode, 200);
    assert.ok(callees.json().edges.some((e: { relation: string }) => e.relation === 'CONSUMED_BY'));

    const traces = await app.inject({
      method: 'GET',
      url: `/nodes/${encodeURIComponent(hit.id)}/traces?depth=10`,
    });
    assert.equal(traces.statusCode, 200);
    assert.ok(Array.isArray(traces.json().upstreamTraces));
    assert.ok(Array.isArray(traces.json().downstreamTraces));

    const surface = await app.inject({
      method: 'GET',
      url: `/nodes/${encodeURIComponent(hit.id)}/surface-impact?depth=10`,
    });
    assert.equal(surface.statusCode, 200);
    assert.ok(surface.json().kafka.publishes.some((p: { topic: string }) => p.topic === 'orders.created'));
  });

  it('lists symbols for the UI datalist', async () => {
    const symbols = await app.inject({ method: 'GET', url: '/nodes/symbols?limit=50' });
    assert.equal(symbols.statusCode, 200);
    assert.equal(symbols.json().analyzer, 'codetracr');
    assert.ok(symbols.json().results.length > 0);
  });

  it('returns 404 for unknown nodes and paths', async () => {
    const missing = await app.inject({ method: 'GET', url: '/nodes/does-not-exist' });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: 'not found', id: 'does-not-exist' });

    const path = await app.inject({ method: 'GET', url: '/nope' });
    assert.equal(path.statusCode, 404);
    assert.equal(path.json().error, 'not found');
  });

  it('rejects unknown analyzers with 500 and non-GET with 405', async () => {
    const analyzer = await app.inject({ method: 'GET', url: '/nodes/search?analyzer=graphify' });
    assert.equal(analyzer.statusCode, 500);
    assert.equal(analyzer.json().error, 'Unknown analyzer: graphify');

    const method = await app.inject({ method: 'POST', url: '/health' });
    assert.equal(method.statusCode, 405);
    assert.deepEqual(method.json(), { error: 'method not allowed' });

    const options = await app.inject({ method: 'OPTIONS', url: '/health' });
    assert.equal(options.statusCode, 204);
  });
});
