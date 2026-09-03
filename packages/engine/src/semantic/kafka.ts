import type { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type { Evidence, Expression, ParsedFile, SymbolRef } from '../types.ts';

export interface KafkaPublishFact {
  publisher: SymbolRef;
  topic: string;
  evidence: Evidence[];
}

export interface KafkaConsumeFact {
  topic: string;
  handler: SymbolRef;
  evidence: Evidence[];
}

export interface KafkaFacts {
  publishes: KafkaPublishFact[];
  consumes: KafkaConsumeFact[];
}

function evidence(file: string, line: number, column: number): Evidence {
  return { provider: 'treesitter', file, line, column };
}

function kafkaMemberCall(
  file: string,
  fact: ParsedFile['facts'][number],
  resolver: SymbolResolver,
  clientType: 'Producer' | 'Consumer',
  method: string,
): { receiver: Expression; argument: Expression } | undefined {
  if (
    fact.kind !== 'CALL' ||
    fact.expression?.kind !== 'CALL' ||
    fact.expression.callee.kind !== 'MEMBER' ||
    fact.expression.callee.property !== method ||
    !fact.owner
  ) {
    return undefined;
  }
  const resolved = resolver.resolveCall(file, fact);
  if (
    resolved?.kind !== 'EXTERNAL' ||
    resolved.receiverType?.module !== 'kafkajs' ||
    resolved.receiverType.name !== clientType
  ) {
    return undefined;
  }
  const argument = fact.expression.arguments[0];
  return argument
    ? { receiver: fact.expression.callee.object, argument }
    : undefined;
}

function staticTopic(
  file: string,
  owner: SymbolRef,
  options: Expression,
  resolver: SymbolResolver,
): string | undefined {
  if (options.kind !== 'OBJECT_LITERAL') return undefined;
  const topic = options.entries.topic;
  if (!topic) return undefined;
  const resolved = resolver.resolveStaticExpression(file, owner, topic);
  return resolved?.kind === 'STRING_LITERAL' ? resolved.value : undefined;
}

export function analyzeKafka(files: ParsedFile[], resolver: SymbolResolver): KafkaFacts {
  const publishes: KafkaPublishFact[] = [];
  const subscriptions = new Map<
    string,
    { topic: string; evidence: Evidence }
  >();
  const handlers = new Map<string, { handler: SymbolRef; evidence: Evidence }>();

  for (const file of files) {
    for (const fact of file.facts) {
      if (!fact.owner) continue;

      const send = kafkaMemberCall(file.file, fact, resolver, 'Producer', 'send');
      if (send) {
        const topic = staticTopic(file.file, fact.owner, send.argument, resolver);
        if (topic) {
          publishes.push({
            publisher: fact.owner,
            topic,
            evidence: [evidence(file.file, fact.line, fact.column)],
          });
        }
      }

      const subscribe = kafkaMemberCall(file.file, fact, resolver, 'Consumer', 'subscribe');
      if (subscribe) {
        const topic = staticTopic(file.file, fact.owner, subscribe.argument, resolver);
        const receiver = resolver.resolveValueSymbol(file.file, fact.owner, subscribe.receiver);
        if (topic && receiver) {
          subscriptions.set(receiver.id, {
            topic,
            evidence: evidence(file.file, fact.line, fact.column),
          });
        }
      }

      const run = kafkaMemberCall(file.file, fact, resolver, 'Consumer', 'run');
      if (run && run.argument.kind === 'OBJECT_LITERAL') {
        const handlerExpression = run.argument.entries.eachMessage;
        const receiver = resolver.resolveValueSymbol(file.file, fact.owner, run.receiver);
        if (!handlerExpression || !receiver) continue;
        const handler = resolver.resolveReference(file.file, fact.owner, handlerExpression);
        if (handler?.kind === 'METHOD') {
          handlers.set(receiver.id, {
            handler: handler.symbol,
            evidence: evidence(file.file, fact.line, fact.column),
          });
        }
      }
    }
  }

  const consumes: KafkaConsumeFact[] = [];
  for (const [receiver, subscription] of subscriptions) {
    const handler = handlers.get(receiver);
    if (!handler) continue;
    consumes.push({
      topic: subscription.topic,
      handler: handler.handler,
      evidence: [subscription.evidence, handler.evidence],
    });
  }
  return { publishes, consumes };
}
