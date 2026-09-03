import type { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type { AstFact, Evidence, Expression, ParsedFile, SymbolRef } from '../types.ts';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export interface HttpEndpointFact {
  method: string;
  path: string;
  handler: SymbolRef;
  evidence: Evidence[];
}

function memberCall(fact: AstFact):
  | { receiver: Expression; method: string; arguments: Expression[] }
  | undefined {
  if (fact.kind !== 'CALL' || fact.expression?.kind !== 'CALL') return undefined;
  const callee = fact.expression.callee;
  if (callee.kind !== 'MEMBER' || callee.optional) return undefined;
  return { receiver: callee.object, method: callee.property, arguments: fact.expression.arguments };
}

function isFastifyReceiver(
  file: string,
  fact: AstFact,
  receiver: Expression,
  resolver: SymbolResolver,
): boolean {
  if (!fact.owner) return false;
  const receiverType = resolver.resolveExpressionType(file, fact.owner, receiver);
  return receiverType?.kind === 'EXTERNAL' && receiverType.module === 'fastify';
}

function joinPath(prefix: string, route: string): string {
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = route.startsWith('/') ? route : `/${route}`;
  return `${left}${right}` || '/';
}

export function analyzeFastify(
  files: ParsedFile[],
  resolver: SymbolResolver,
): HttpEndpointFact[] {
  const registeredPlugins = new Map<
    string,
    { prefix?: string; evidence?: Evidence }
  >();

  for (const file of files) {
    for (const fact of file.facts) {
      const call = memberCall(fact);
      if (
        !call ||
        call.method !== 'register' ||
        !fact.owner ||
        !isFastifyReceiver(file.file, fact, call.receiver, resolver)
      ) {
        continue;
      }
      const pluginExpression = call.arguments[0];
      const options = call.arguments[1];
      if (!pluginExpression) continue;
      const plugin = resolver.resolveReference(file.file, fact.owner, pluginExpression);
      if (plugin?.kind !== 'FUNCTION') continue;

      const prefixExpression =
        options?.kind === 'OBJECT_LITERAL' ? options.entries.prefix : undefined;
      const prefix = prefixExpression
        ? resolver.resolveStaticExpression(file.file, fact.owner, prefixExpression)
        : undefined;
      registeredPlugins.set(plugin.symbol.id, {
        prefix: prefix?.kind === 'STRING_LITERAL' ? prefix.value : undefined,
        evidence:
          prefix?.kind === 'STRING_LITERAL'
            ? {
            provider: 'treesitter',
            file: file.file,
            line: fact.line,
            column: fact.column,
              }
            : undefined,
      });
    }
  }

  const endpoints: HttpEndpointFact[] = [];
  for (const file of files) {
    for (const fact of file.facts) {
      const call = memberCall(fact);
      const registeredPluginReceiver =
        fact.owner &&
        registeredPlugins.has(fact.owner.id) &&
        call?.receiver.kind === 'IDENTIFIER' &&
        file.facts.some(
          (candidate) =>
            candidate.kind === 'ARGUMENT' &&
            candidate.owner?.id === fact.owner?.id &&
            candidate.name === call.receiver.text,
        );
      if (
        !call ||
        !HTTP_METHODS.has(call.method) ||
        !fact.owner ||
        (!isFastifyReceiver(file.file, fact, call.receiver, resolver) && !registeredPluginReceiver)
      ) {
        continue;
      }
      const route = call.arguments[0];
      const routeOptions = call.arguments[1];
      const handlerExpression =
        call.arguments[2] ??
        (routeOptions?.kind === 'OBJECT_LITERAL'
          ? routeOptions.entries.handler
          : routeOptions);
      if (route?.kind !== 'STRING_LITERAL' || !handlerExpression) continue;
      const handler = resolver.resolveReference(file.file, fact.owner, handlerExpression);
      if (handler?.kind !== 'METHOD' && handler?.kind !== 'FUNCTION') continue;
      const plugin = registeredPlugins.get(fact.owner.id);
      endpoints.push({
        method: call.method.toUpperCase(),
        path: joinPath(plugin?.prefix ?? '', route.value),
        handler: handler.symbol,
        evidence: [
          {
            provider: 'treesitter',
            file: file.file,
            line: fact.line,
            column: fact.column,
          },
          ...(plugin?.evidence ? [plugin.evidence] : []),
        ],
      });
    }
  }
  return endpoints;
}
