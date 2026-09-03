import type { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type { Evidence, ParsedFile, SymbolRef } from '../types.ts';

interface SemanticRelation {
  from: SymbolRef;
  to: SymbolRef;
  evidence: Evidence[];
}

export interface DependencyInjectionFacts {
  dependencies: SemanticRelation[];
  implementations: SemanticRelation[];
  injections: SemanticRelation[];
  dispatches: SemanticRelation[];
  properties: SymbolRef[];
}

function evidence(file: string, line: number, column: number): Evidence {
  return { provider: 'treesitter', file, line, column };
}

export function analyzeDependencyInjection(
  files: ParsedFile[],
  resolver: SymbolResolver,
): DependencyInjectionFacts {
  const dependencies: SemanticRelation[] = [];
  const implementations: SemanticRelation[] = [];
  const injections: SemanticRelation[] = [];
  const dispatches: SemanticRelation[] = [];
  const properties = new Map<string, SymbolRef>();

  for (const file of files) {
    for (const fact of file.facts) {
      if (fact.kind === 'CLASS' && fact.symbol) {
        for (const typeName of fact.implementedTypes ?? []) {
          const target = resolver.resolveTypeName(file.file, typeName);
          if (target?.kind === 'INTERFACE') {
            implementations.push({
              from: fact.symbol,
              to: target,
              evidence: [evidence(file.file, fact.line, fact.column)],
            });
          }
        }
      }
      if (
        fact.kind === 'CLASS_PROPERTY' &&
        fact.symbol &&
        fact.owner?.kind === 'CLASS' &&
        fact.typeAnnotation
      ) {
        const dependency = resolver.resolveTypeName(file.file, fact.typeAnnotation);
        if (dependency?.kind === 'INTERFACE') {
          properties.set(fact.symbol.id, fact.symbol);
          dependencies.push({
            from: fact.owner,
            to: dependency,
            evidence: [evidence(file.file, fact.line, fact.column)],
          });
        }
      }
    }
  }

  const implementedByClass = new Map<string, Set<string>>();
  for (const relation of implementations) {
    const implemented = implementedByClass.get(relation.from.id) ?? new Set<string>();
    implemented.add(relation.to.id);
    implementedByClass.set(relation.from.id, implemented);
  }

  for (const file of files) {
    for (const fact of file.facts) {
      if (
        fact.kind !== 'NEW' ||
        fact.expression?.kind !== 'NEW' ||
        !fact.owner
      ) {
        continue;
      }
      const serviceClass = resolver.resolveExpressionType(file.file, fact.owner, fact.expression);
      if (serviceClass?.kind !== 'CLASS') continue;
      for (const property of resolver.classProperties(serviceClass)) {
        if (property.type?.kind !== 'INTERFACE' || property.index === undefined) continue;
        const argument = fact.expression.arguments[property.index];
        if (!argument) continue;
        const implementation = resolver.resolveExpressionType(file.file, fact.owner, argument);
        if (
          implementation?.kind !== 'CLASS' ||
          !implementedByClass.get(implementation.id)?.has(property.type.id)
        ) {
          continue;
        }
        properties.set(property.symbol.id, property.symbol);
        injections.push({
          from: property.symbol,
          to: implementation,
          evidence: [evidence(file.file, fact.line, fact.column)],
        });
      }
    }
  }

  const injectionByProperty = new Map<string, SemanticRelation[]>();
  for (const injection of injections) {
    const relations = injectionByProperty.get(injection.from.id) ?? [];
    relations.push(injection);
    injectionByProperty.set(injection.from.id, relations);
  }

  for (const file of files) {
    for (const fact of file.facts) {
      if (
        fact.kind !== 'CALL' ||
        fact.expression?.kind !== 'CALL' ||
        fact.expression.callee.kind !== 'MEMBER' ||
        !fact.owner
      ) {
        continue;
      }
      const resolved = resolver.resolveCall(file.file, fact);
      if (resolved?.kind !== 'METHOD' || resolved.receiverType?.kind !== 'INTERFACE') continue;
      const property = resolver.resolveValueSymbol(
        file.file,
        fact.owner,
        fact.expression.callee.object,
      );
      if (!property) continue;
      for (const injection of injectionByProperty.get(property.id) ?? []) {
        const concreteMethod = resolver.methodFor(
          injection.to,
          fact.expression.callee.property,
        );
        if (!concreteMethod) continue;
        dispatches.push({
          from: resolved.symbol,
          to: concreteMethod,
          evidence: [
            evidence(file.file, fact.line, fact.column),
            ...injection.evidence,
          ],
        });
      }
    }
  }

  return {
    dependencies,
    implementations,
    injections,
    dispatches,
    properties: [...properties.values()],
  };
}
