import { analyzeFastify } from '../semantic/fastify.ts';
import { analyzeSql } from '../semantic/sql.ts';
import { analyzeDependencyInjection } from '../semantic/dependency-injection.ts';
import { analyzeConditionalFactories } from '../semantic/conditional-factory.ts';
import { analyzeKafka } from '../semantic/kafka.ts';
import { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type {
  CallOccurrence,
  CodeTracrEdge,
  CodeTracrGraph,
  CodeTracrNode,
  Evidence,
  ParsedFile,
  Provenance,
  SourceRange,
  SymbolRef,
} from '../types.ts';

function treeSitterEvidence(file: string, line: number, column: number): Evidence {
  return { provider: 'treesitter', file, line, column };
}

function addNode(nodes: Map<string, CodeTracrNode>, node: CodeTracrNode): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, { ...node, evidence: [...node.evidence] });
    return;
  }
  for (const evidence of node.evidence) {
    if (!existing.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))) {
      existing.evidence.push(evidence);
    }
  }
}

function addEdge(edges: Map<string, CodeTracrEdge>, edge: CodeTracrEdge): void {
  const key = `${edge.from}\0${edge.type}\0${edge.to}`;
  const existing = edges.get(key);
  if (!existing) {
    edges.set(key, edge);
    return;
  }
  for (const evidence of edge.provenance.evidence) {
    if (
      !existing.provenance.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))
    ) {
      existing.provenance.evidence.push(evidence);
    }
  }
  const incoming = edge.provenance.occurrences ?? [];
  if (!incoming.length) return;
  const occurrences = existing.provenance.occurrences ?? [];
  for (const occurrence of incoming) {
    const duplicate = occurrences.some(
      (item) =>
        item.line === occurrence.line &&
        item.column === occurrence.column &&
        item.order === occurrence.order,
    );
    if (!duplicate) occurrences.push(occurrence);
  }
  occurrences.sort(
    (a, b) => a.order - b.order || a.line - b.line || a.column - b.column,
  );
  existing.provenance.occurrences = occurrences;
}

interface PendingCallSite {
  ownerId: string;
  toId: string;
  file: string;
  line: number;
  column: number;
  sourceRange?: SourceRange;
  evidence: Evidence[];
}

function compareCallSites(a: PendingCallSite, b: PendingCallSite): number {
  const aLine = a.sourceRange?.startLine ?? a.line;
  const bLine = b.sourceRange?.startLine ?? b.line;
  if (aLine !== bLine) return aLine - bLine;
  const aCol = a.sourceRange?.startColumn ?? a.column;
  const bCol = b.sourceRange?.startColumn ?? b.column;
  if (aCol !== bCol) return aCol - bCol;
  return a.file.localeCompare(b.file);
}

function assignSourceOrders(callSites: PendingCallSite[]): Map<PendingCallSite, number> {
  const byOwner = new Map<string, PendingCallSite[]>();
  for (const site of callSites) {
    const list = byOwner.get(site.ownerId) ?? [];
    list.push(site);
    byOwner.set(site.ownerId, list);
  }
  const orderBySite = new Map<PendingCallSite, number>();
  for (const sites of byOwner.values()) {
    const sorted = [...sites].sort(compareCallSites);
    sorted.forEach((site, index) => orderBySite.set(site, index + 1));
  }
  return orderBySite;
}

function graphNode(symbol: SymbolRef, line: number, evidence: Evidence): CodeTracrNode | undefined {
  if (
    !['MODULE', 'CLASS', 'INTERFACE', 'CLASS_PROPERTY', 'METHOD', 'FUNCTION'].includes(
      symbol.kind,
    )
  ) {
    return undefined;
  }
  return {
    id: symbol.id,
    type: symbol.kind as CodeTracrNode['type'],
    name: symbol.name,
    file: symbol.module,
    line,
    evidence: [evidence],
  };
}

function provenance(
  evidence: Evidence[],
  derivation: Provenance['derivation'],
  certainty: Provenance['certainty'] = 'DEFINITE',
): Provenance {
  return { evidence: [...evidence], derivation, confidence: 1, certainty };
}

export function buildCodeTracrGraph(files: ParsedFile[]): CodeTracrGraph {
  const nodes = new Map<string, CodeTracrNode>();
  const edges = new Map<string, CodeTracrEdge>();
  const unresolved: CodeTracrGraph['unresolved'] = [];
  const resolver = new SymbolResolver(files);
  const endpoints = analyzeFastify(files, resolver);
  const databaseAccesses = analyzeSql(files, resolver);
  const dependencyInjection = analyzeDependencyInjection(files, resolver);
  const conditionalFactories = analyzeConditionalFactories(files, resolver);
  const kafka = analyzeKafka(files, resolver);
  const semanticallyHandledCalls = new Set(
    [...endpoints, ...databaseAccesses].flatMap((fact) =>
      fact.evidence
        .filter((item) => item.provider === 'treesitter')
        .map((item) => `${item.file}:${item.line}:${item.column ?? 1}`),
    ),
  );

  for (const file of files) {
    const moduleEvidence = treeSitterEvidence(file.file, 1, 1);
    addNode(nodes, {
      id: `module:${file.file}`,
      type: 'MODULE',
      name: file.file,
      file: file.file,
      line: 1,
      evidence: [moduleEvidence],
    });
    for (const fact of file.facts) {
      if (
        fact.symbol &&
        ['CLASS', 'INTERFACE', 'CLASS_PROPERTY', 'METHOD', 'FUNCTION'].includes(
          fact.symbol.kind,
        )
      ) {
        const node = graphNode(
          fact.symbol,
          fact.line,
          treeSitterEvidence(file.file, fact.line, fact.column),
        );
        if (node) addNode(nodes, node);
      }
      if (fact.kind === 'IMPORT') {
        for (const binding of fact.bindings ?? []) {
          const importedFile = resolver.importedModule(file.file, binding.local);
          if (!importedFile) continue;
          addEdge(edges, {
            from: `module:${file.file}`,
            to: `module:${importedFile}`,
            type: 'IMPORTS',
            provenance: provenance(
              [treeSitterEvidence(file.file, fact.line, fact.column)],
              { kind: 'syntax' },
            ),
          });
        }
      }
    }
  }

  const pendingCalls: PendingCallSite[] = [];

  for (const file of files) {
    for (const fact of file.facts) {
      if (fact.kind !== 'CALL' || fact.expression?.kind !== 'CALL' || !fact.owner) continue;
      const resolved = resolver.resolveCall(file.file, fact);
      const ownerIsCallable = fact.owner.kind === 'METHOD' || fact.owner.kind === 'FUNCTION';
      if (
        ownerIsCallable &&
        resolved &&
        (resolved.kind === 'METHOD' || resolved.kind === 'FUNCTION')
      ) {
        const evidence = [treeSitterEvidence(file.file, fact.line, fact.column)];
        pendingCalls.push({
          ownerId: fact.owner.id,
          toId: resolved.symbol.id,
          file: file.file,
          line: fact.line,
          column: fact.column,
          sourceRange: fact.sourceRange,
          evidence,
        });
      } else if (
        ownerIsCallable &&
        !resolved &&
        !semanticallyHandledCalls.has(`${file.file}:${fact.line}:${fact.column}`)
      ) {
        unresolved.push({
          expression: fact.expression.callee.text,
          file: file.file,
          line: fact.line,
          reason: 'No deterministic binding and receiver type could be established.',
        });
      }
    }
  }

  const orderBySite = assignSourceOrders(pendingCalls);
  for (const site of pendingCalls) {
    const order = orderBySite.get(site) ?? 1;
    const occurrence: CallOccurrence = {
      line: site.line,
      column: site.column,
      order,
      sourceRange: site.sourceRange,
    };
    addEdge(edges, {
      from: site.ownerId,
      to: site.toId,
      type: 'CALLS',
      provenance: {
        evidence: site.evidence,
        derivation: { kind: 'symbol-resolution' },
        confidence: 1,
        certainty: 'DEFINITE',
        occurrences: [occurrence],
      },
    });
  }

  for (const endpoint of endpoints) {
    const id = `http:${endpoint.method}:${endpoint.path}`;
    addNode(nodes, {
      id,
      type: 'HTTP_ENDPOINT',
      name: `${endpoint.method} ${endpoint.path}`,
      file: endpoint.evidence[0]?.file,
      line: endpoint.evidence[0]?.line,
      method: endpoint.method,
      path: endpoint.path,
      evidence: endpoint.evidence,
    });
    addEdge(edges, {
      from: id,
      to: endpoint.handler.id,
      type: 'HANDLES',
      provenance: provenance(endpoint.evidence, {
        kind: 'semantic-rule',
        rule: 'fastify-route',
      }),
    });
  }

  for (const access of databaseAccesses) {
    const id = `table:${access.table}`;
    addNode(nodes, {
      id,
      type: 'DATABASE_TABLE',
      name: access.table,
      evidence: access.evidence,
    });
    addEdge(edges, {
      from: access.owner.id,
      to: id,
      type: access.operation === 'SELECT' ? 'READS' : 'WRITES',
      provenance: provenance(access.evidence, {
        kind: 'semantic-rule',
        rule: 'sql-table-access',
      }),
    });
  }

  for (const relation of dependencyInjection.dependencies) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'DEPENDS_ON',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'interface-di',
      }),
    });
  }
  for (const relation of dependencyInjection.implementations) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'IMPLEMENTS',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'interface-di',
      }),
    });
  }
  for (const relation of dependencyInjection.injections) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'INJECTED_WITH',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'interface-di',
      }),
    });
  }
  for (const relation of dependencyInjection.dispatches) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'RESOLVES_TO',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'interface-di',
      }),
    });
  }
  for (const relation of conditionalFactories.definiteInjections) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'INJECTED_WITH',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'conditional-factory-analysis',
      }),
    });
  }
  for (const relation of conditionalFactories.definiteResolutions) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'RESOLVES_TO',
      provenance: provenance(relation.evidence, {
        kind: 'semantic-rule',
        rule: 'conditional-factory-analysis',
      }),
    });
  }
  for (const relation of conditionalFactories.possibleResolutions) {
    addEdge(edges, {
      from: relation.from.id,
      to: relation.to.id,
      type: 'POSSIBLE_RESOLUTION',
      provenance: provenance(
        relation.evidence,
        { kind: 'semantic-rule', rule: 'conditional-factory-analysis' },
        'POSSIBLE',
      ),
    });
  }
  for (const publish of kafka.publishes) {
    const topicId = `topic:${publish.topic}`;
    addNode(nodes, {
      id: topicId,
      type: 'EVENT_TOPIC',
      name: publish.topic,
      evidence: publish.evidence,
    });
    addEdge(edges, {
      from: publish.publisher.id,
      to: topicId,
      type: 'PUBLISHES',
      provenance: provenance(publish.evidence, {
        kind: 'semantic-rule',
        rule: 'kafka-event',
      }),
    });
  }
  for (const consume of kafka.consumes) {
    const topicId = `topic:${consume.topic}`;
    addNode(nodes, {
      id: topicId,
      type: 'EVENT_TOPIC',
      name: consume.topic,
      evidence: consume.evidence,
    });
    addEdge(edges, {
      from: topicId,
      to: consume.handler.id,
      type: 'CONSUMED_BY',
      provenance: provenance(consume.evidence, {
        kind: 'semantic-rule',
        rule: 'kafka-event',
      }),
    });
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        a.type.localeCompare(b.type),
    ),
    unresolved,
  };
}
