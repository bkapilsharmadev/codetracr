import type { FastifyInstance } from 'fastify';
import type { GraphService } from '../../../../application/graph-service.ts';
import { parseDepth, parseLimit, requireAnalyzer } from '../query.ts';
import type { DepthQuery, SearchQuery, SymbolsQuery } from '../http-types.ts';

function pathnameOf(url: string): string {
  return url.split('?')[0] ?? '';
}

/** Match /nodes/:id and /nodes/:id/:action using the raw path so %2F in ids stays one segment. */
function matchEncodedNodePath(rawUrl: string): { id: string; action?: string } | null {
  const pathname = pathnameOf(rawUrl);
  const withAction =
    /^\/nodes\/([^/]+)\/(callers|callees|lineage|traces|impact|surface-impact)$/.exec(pathname);
  if (withAction) {
    return { id: decodeURIComponent(withAction[1]!), action: withAction[2] };
  }
  const nodeOnly = /^\/nodes\/([^/]+)$/.exec(pathname);
  if (nodeOnly) return { id: decodeURIComponent(nodeOnly[1]!) };
  return null;
}

export async function registerNodeRoutes(
  app: FastifyInstance,
  opts: { graph: GraphService },
): Promise<void> {
  const graph = opts.graph;

  app.get('/nodes/search', async (req, reply) => {
    const query = req.query as SearchQuery;
    requireAnalyzer(query.analyzer);
    const q = query.q ?? '';
    const limit = parseLimit(query.limit, 20);
    return reply.send({
      analyzer: graph.analyzerId,
      query: q,
      results: await graph.search(q, limit),
    });
  });

  app.get('/nodes/symbols', async (req, reply) => {
    const query = req.query as SymbolsQuery;
    requireAnalyzer(query.analyzer);
    const limit = parseLimit(query.limit, 500);
    return reply.send({
      analyzer: graph.analyzerId,
      results: await graph.listSymbols(limit),
    });
  });

  app.get('/nodes/*', async (req, reply) => {
    const query = req.query as DepthQuery;
    requireAnalyzer(query.analyzer);
    const matched = matchEncodedNodePath(req.raw.url ?? req.url);
    if (!matched) {
      return reply.code(404).send({ error: 'not found', path: pathnameOf(req.url) });
    }
    const { id, action } = matched;

    if (!action) {
      const node = await graph.getNode(id);
      if (!node) return reply.code(404).send({ error: 'not found', id });
      return reply.send({ analyzer: graph.analyzerId, node });
    }

    if (action === 'callers') {
      const result = await graph.callers(id);
      return reply.send({ analyzer: graph.analyzerId, id, ...result });
    }
    if (action === 'callees') {
      const result = await graph.callees(id);
      return reply.send({ analyzer: graph.analyzerId, id, ...result });
    }
    if (action === 'lineage') {
      const depth = parseDepth(query.depth);
      const result = await graph.lineage(id, depth);
      return reply.send({ analyzer: graph.analyzerId, depth: depth || 'unlimited', ...result });
    }
    if (action === 'traces') {
      const depth = parseDepth(query.depth);
      const result = await graph.traces(id, depth);
      return reply.send({ analyzer: graph.analyzerId, depth: depth || 'unlimited', ...result });
    }
    if (action === 'impact') {
      const depth = parseDepth(query.depth) || 3;
      const result = await graph.impact(id, depth);
      return reply.send({ analyzer: graph.analyzerId, ...result });
    }
    if (action === 'surface-impact') {
      const depth = parseDepth(query.depth);
      const result = await graph.surfaceImpact(id, depth);
      return reply.send({ analyzer: graph.analyzerId, ...result });
    }

    return reply.code(404).send({ error: 'not found', path: pathnameOf(req.url) });
  });
}
