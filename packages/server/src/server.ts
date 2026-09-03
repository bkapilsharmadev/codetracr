import { createServer } from 'node:http';
import { repoRoot, webRoot, port } from './config.ts';
import {
  resolveCodeTracrGraphPath,
  resolveCodeTracrSourceRoot,
} from './paths.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { type AnalyzerId, type GraphAnalyzerPort } from './adapters/graph-data.ts';
import { loadCodeTracrJsonAdapter } from './adapters/codetracr-json.ts';

const codeTracrGraphPath = resolveCodeTracrGraphPath(repoRoot);
const adapter = loadCodeTracrJsonAdapter(codeTracrGraphPath);

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

function pickAnalyzer(url: URL): GraphAnalyzerPort {
  const id = (url.searchParams.get('analyzer') ?? 'codetracr') as AnalyzerId;
  if (id !== 'codetracr') throw new Error(`Unknown analyzer: ${id}`);
  return adapter;
}

function serveStatic(relativePath: string, res: import('node:http').ServerResponse): boolean {
  const file = relativePath === '' || relativePath === '/' ? 'index.html' : relativePath.replace(/^\//, '');
  const full = join(webRoot, file);
  const normalizedRoot = webRoot.toLowerCase();
  const normalizedFull = full.toLowerCase();
  if (!normalizedFull.startsWith(normalizedRoot) || !existsSync(full)) return false;

  const ext = full.split('.').pop() ?? '';
  const types: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
  };

  const body = readFileSync(full);
  res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' });
  res.end(body);
  return true;
}

function parseDepth(raw: string | null): number {
  if (!raw || raw === '0' || raw.toLowerCase() === 'unlimited') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function sendError(res: import('node:http').ServerResponse, err: unknown) {
  json(res, 500, { error: err instanceof Error ? err.message : String(err) });
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      if (res.headersSent) return;
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      json(res, 405, { error: 'method not allowed' });
      return;
    }

    // UI static assets — never fall through to API handlers
    if (url.pathname === '/' || url.pathname === '/ui' || url.pathname.startsWith('/ui/')) {
      const rel =
        url.pathname === '/' || url.pathname === '/ui'
          ? 'index.html'
          : url.pathname.replace(/^\/ui\/?/, '');
      if (serveStatic(rel, res)) return;
      json(res, 404, { error: 'not found', path: url.pathname });
      return;
    }

    if (url.pathname === '/health') {
      json(res, 200, { ok: true, analyzers: ['codetracr'] });
      return;
    }

    if (url.pathname === '/config') {
      json(res, 200, {
        repoRoot,
        sourceRoot: resolveCodeTracrSourceRoot(repoRoot, codeTracrGraphPath),
        graphPath: codeTracrGraphPath,
        editorScheme: process.env.CODETRACR_EDITOR_SCHEME ?? 'vscode',
      });
      return;
    }

    if (!url.pathname.startsWith('/nodes')) {
      json(res, 404, { error: 'not found', path: url.pathname });
      return;
    }

    const adapter = pickAnalyzer(url);

    if (url.pathname === '/nodes/search') {
      const q = url.searchParams.get('q') ?? '';
      const limit = Number(url.searchParams.get('limit') ?? '20');
      json(res, 200, {
        analyzer: adapter.id,
        query: q,
        results: adapter.search(q, Number.isFinite(limit) && limit > 0 ? limit : 20),
      });
      return;
    }

    if (url.pathname === '/nodes/symbols') {
      const limit = Number(url.searchParams.get('limit') ?? '500');
      json(res, 200, {
        analyzer: adapter.id,
        results: adapter.listSymbols(Number.isFinite(limit) && limit > 0 ? limit : 500),
      });
      return;
    }

    const nodeMatch = /^\/nodes\/([^/]+)$/.exec(url.pathname);
    if (nodeMatch) {
      const id = decodeURIComponent(nodeMatch[1]!);
      const node = adapter.getNode(id);
      if (!node) {
        json(res, 404, { error: 'not found', id });
        return;
      }
      json(res, 200, { analyzer: adapter.id, node });
      return;
    }

    const callersMatch = /^\/nodes\/([^/]+)\/callers$/.exec(url.pathname);
    if (callersMatch) {
      const id = decodeURIComponent(callersMatch[1]!);
      const result = adapter.callers(id);
      json(res, 200, { analyzer: adapter.id, id, ...result });
      return;
    }

    const calleesMatch = /^\/nodes\/([^/]+)\/callees$/.exec(url.pathname);
    if (calleesMatch) {
      const id = decodeURIComponent(calleesMatch[1]!);
      const result = adapter.callees(id);
      json(res, 200, { analyzer: adapter.id, id, ...result });
      return;
    }

    const lineageMatch = /^\/nodes\/([^/]+)\/lineage$/.exec(url.pathname);
    if (lineageMatch) {
      const id = decodeURIComponent(lineageMatch[1]!);
      const depth = parseDepth(url.searchParams.get('depth'));
      const result = adapter.lineage(id, depth);
      json(res, 200, { analyzer: adapter.id, depth: depth || 'unlimited', ...result });
      return;
    }

    const tracesMatch = /^\/nodes\/([^/]+)\/traces$/.exec(url.pathname);
    if (tracesMatch) {
      const id = decodeURIComponent(tracesMatch[1]!);
      const depth = parseDepth(url.searchParams.get('depth'));
      const result = adapter.traces(id, depth);
      json(res, 200, { analyzer: adapter.id, depth: depth || 'unlimited', ...result });
      return;
    }

    const impactMatch = /^\/nodes\/([^/]+)\/impact$/.exec(url.pathname);
    if (impactMatch) {
      const id = decodeURIComponent(impactMatch[1]!);
      const depth = parseDepth(url.searchParams.get('depth')) || 3;
      const result = adapter.impact(id, depth);
      json(res, 200, { analyzer: adapter.id, ...result });
      return;
    }

    const surfaceMatch = /^\/nodes\/([^/]+)\/surface-impact$/.exec(url.pathname);
    if (surfaceMatch) {
      const id = decodeURIComponent(surfaceMatch[1]!);
      const depth = parseDepth(url.searchParams.get('depth'));
      const result = adapter.surfaceImpact(id, depth);
      json(res, 200, { analyzer: adapter.id, ...result });
      return;
    }

    json(res, 404, { error: 'not found', path: url.pathname });
  } catch (err) {
    sendError(res, err);
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set CODETRACR_PORT to another port.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  console.log(`CodeTracr on http://127.0.0.1:${port}`);
  console.log(`UI: http://127.0.0.1:${port}/ui/`);
  if (!existsSync(join(webRoot, 'dist', 'graph-view.js'))) {
    console.warn('UI bundles missing. Run npm run build before opening the UI.');
  }
});
