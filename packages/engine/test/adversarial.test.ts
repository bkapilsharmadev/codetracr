import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseTypeScriptSource } from '../src/parser/treesitter.ts';
import type { CodeTracrGraph, ParsedFile } from '../src/types.ts';

function graph(sources: Record<string, string>): CodeTracrGraph {
  const files: ParsedFile[] = Object.entries(sources).map(([file, source]) =>
    parseTypeScriptSource(source, file),
  );
  return buildCodeTracrGraph(files);
}

function hasEdge(graph: CodeTracrGraph, from: string, to: string, type = 'CALLS'): boolean {
  return graph.edges.some(
    (edge) => edge.from === from && edge.to === to && edge.type === type,
  );
}

describe('adversarial identity and fail-closed controls', () => {
  it('keeps duplicate class and method names isolated by module', () => {
    const result = graph({
      'src/a/service.ts': `export class OrderService { create() {} }`,
      'src/a/caller.ts': `
        import { OrderService } from "./service";
        export function callA() {
          const service = new OrderService();
          service.create();
        }`,
      'src/b/service.ts': `export class OrderService { create() {} }`,
      'src/b/caller.ts': `
        import { OrderService } from "./service";
        export function callB() {
          const service = new OrderService();
          service.create();
        }`,
    });

    const callA = 'function:src/a/caller.ts#callA';
    const callB = 'function:src/b/caller.ts#callB';
    const serviceA = 'method:src/a/service.ts#OrderService.create';
    const serviceB = 'method:src/b/service.ts#OrderService.create';
    assert.ok(hasEdge(result, callA, serviceA));
    assert.ok(hasEdge(result, callB, serviceB));
    assert.ok(!hasEdge(result, callA, serviceB));
    assert.ok(!hasEdge(result, callB, serviceA));
  });

  it('resolves same-named local variables within their callable scopes', () => {
    const result = graph({
      'src/shadowing.ts': `
        class OrderService { create() {} }
        class PaymentService { create() {} }
        function createOrder() {
          const service = new OrderService();
          service.create();
        }
        function createPayment() {
          const service = new PaymentService();
          service.create();
        }`,
    });

    assert.ok(
      hasEdge(
        result,
        'function:src/shadowing.ts#createOrder',
        'method:src/shadowing.ts#OrderService.create',
      ),
    );
    assert.ok(
      hasEdge(
        result,
        'function:src/shadowing.ts#createPayment',
        'method:src/shadowing.ts#PaymentService.create',
      ),
    );
    assert.ok(
      !hasEdge(
        result,
        'function:src/shadowing.ts#createOrder',
        'method:src/shadowing.ts#PaymentService.create',
      ),
    );
  });

  it('does not treat an unrelated app.post as Fastify', () => {
    const result = graph({
      'src/not-fastify.ts': `
        const app = { post() {} };
        function handler() {}
        app.post("/something", handler);`,
    });
    assert.equal(result.nodes.filter((node) => node.type === 'HTTP_ENDPOINT').length, 0);
    assert.equal(result.edges.filter((edge) => edge.type === 'HANDLES').length, 0);
  });

  it('does not treat an unrelated db.query as database access', () => {
    const result = graph({
      'src/not-database.ts': `
        const db = { query() {} };
        class Repository {
          save() {
            db.query("INSERT INTO orders (id) VALUES (1)");
          }
        }`,
    });
    assert.equal(result.nodes.filter((node) => node.type === 'DATABASE_TABLE').length, 0);
    assert.equal(result.edges.filter((edge) => edge.type === 'WRITES').length, 0);
  });

  it('records evidence and derivation independently', () => {
    const result = graph({
      'src/service.ts': `export class Service { run() {} }`,
      'src/caller.ts': `
        import { Service } from "./service";
        export function call() {
          const service = new Service();
          service.run();
        }`,
    });
    const edge = result.edges.find((candidate) => candidate.type === 'CALLS');
    assert.ok(edge);
    assert.equal(edge.provenance.derivation.kind, 'symbol-resolution');
    assert.deepEqual(edge.provenance.evidence.map((item) => item.provider), ['treesitter']);
  });
});
