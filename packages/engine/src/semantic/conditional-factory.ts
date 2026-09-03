import type { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type { Evidence, Expression, ParsedFile, SymbolRef } from '../types.ts';

interface Relation {
  from: SymbolRef;
  to: SymbolRef;
  evidence: Evidence[];
}

interface FactoryReturn {
  implementation: SymbolRef;
  condition?: Expression;
  evidence: Evidence;
}

interface FactoryInfo {
  symbol: SymbolRef;
  returnType: SymbolRef;
  parameterName?: string;
  returns: FactoryReturn[];
}

export interface ConditionalFactoryFacts {
  definiteInjections: Relation[];
  definiteResolutions: Relation[];
  possibleResolutions: Relation[];
}

function evidence(file: string, line: number, column: number): Evidence {
  return { provider: 'treesitter', file, line, column };
}

function evaluateCondition(
  condition: Expression | undefined,
  parameterName: string | undefined,
  argument: Expression | undefined,
): boolean | undefined {
  if (!condition) return true;
  if (
    !parameterName ||
    condition.kind !== 'BINARY' ||
    !['===', '=='].includes(condition.operator) ||
    condition.left.kind !== 'MEMBER' ||
    condition.left.object.kind !== 'IDENTIFIER' ||
    condition.left.object.name !== parameterName ||
    condition.right.kind !== 'STRING_LITERAL' ||
    argument?.kind !== 'OBJECT_LITERAL'
  ) {
    return undefined;
  }
  const actual = argument.entries[condition.left.property];
  return actual?.kind === 'STRING_LITERAL'
    ? actual.value === condition.right.value
    : undefined;
}

export function analyzeConditionalFactories(
  files: ParsedFile[],
  resolver: SymbolResolver,
): ConditionalFactoryFacts {
  const factories = new Map<string, FactoryInfo>();

  for (const file of files) {
    for (const fact of file.facts) {
      if (fact.kind !== 'FUNCTION' || !fact.symbol) continue;
      const returnType = resolver.functionReturnType(fact.symbol);
      if (returnType?.kind !== 'INTERFACE') continue;
      factories.set(fact.symbol.id, {
        symbol: fact.symbol,
        returnType,
        parameterName: resolver.functionParameters(fact.symbol)[0]?.name,
        returns: [],
      });
    }
  }

  for (const file of files) {
    for (const fact of file.facts) {
      if (
        fact.kind !== 'RETURN' ||
        fact.expression?.kind !== 'NEW' ||
        fact.owner?.kind !== 'FUNCTION'
      ) {
        continue;
      }
      const factory = factories.get(fact.owner.id);
      if (!factory) continue;
      const implementation = resolver.resolveExpressionType(file.file, fact.owner, fact.expression);
      if (implementation?.kind !== 'CLASS') continue;
      factory.returns.push({
        implementation,
        condition: fact.condition,
        evidence: evidence(file.file, fact.line, fact.column),
      });
    }
  }

  const callsByProperty = new Map<
    string,
    Array<{ owner: SymbolRef; methodName: string; evidence: Evidence }>
  >();
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
      const calls = callsByProperty.get(property.id) ?? [];
      calls.push({
        owner: fact.owner,
        methodName: fact.expression.callee.property,
        evidence: evidence(file.file, fact.line, fact.column),
      });
      callsByProperty.set(property.id, calls);
    }
  }

  const definiteInjections: Relation[] = [];
  const definiteResolutions: Relation[] = [];
  const possibleResolutions: Relation[] = [];

  for (const file of files) {
    for (const fact of file.facts) {
      if (fact.kind !== 'NEW' || fact.expression?.kind !== 'NEW' || !fact.owner) continue;
      const service = resolver.resolveExpressionType(file.file, fact.owner, fact.expression);
      if (service?.kind !== 'CLASS') continue;
      for (const property of resolver.classProperties(service)) {
        if (property.type?.kind !== 'INTERFACE' || property.index === undefined) continue;
        const argument = fact.expression.arguments[property.index];
        if (argument?.kind !== 'CALL') continue;
        const factoryResolution = resolver.resolveReference(file.file, fact.owner, argument.callee);
        if (factoryResolution?.kind !== 'FUNCTION') continue;
        const factory = factories.get(factoryResolution.symbol.id);
        if (!factory || factory.returnType.id !== property.type.id) continue;
        const factoryArgument = argument.arguments[0];
        const selected: FactoryReturn[] = [];
        let dynamic = false;
        for (const candidate of factory.returns.sort(
          (a, b) => a.evidence.line - b.evidence.line,
        )) {
          const result = evaluateCondition(
            candidate.condition,
            factory.parameterName,
            factoryArgument,
          );
          if (result === true) {
            selected.push(candidate);
            if (!dynamic) break;
          } else if (result === undefined) {
            dynamic = true;
            selected.push(candidate);
          }
        }
        const compositionEvidence = evidence(file.file, fact.line, fact.column);
        for (const candidate of selected) {
          const relationEvidence = [compositionEvidence, candidate.evidence];
          if (!dynamic) {
            definiteInjections.push({
              from: property.symbol,
              to: candidate.implementation,
              evidence: relationEvidence,
            });
          }
          for (const call of callsByProperty.get(property.symbol.id) ?? []) {
            const method = resolver.methodFor(candidate.implementation, call.methodName);
            if (!method) continue;
            const relation = {
              from: call.owner,
              to: method,
              evidence: [call.evidence, ...relationEvidence],
            };
            if (dynamic) possibleResolutions.push(relation);
            else definiteResolutions.push(relation);
          }
        }
      }
    }
  }

  return { definiteInjections, definiteResolutions, possibleResolutions };
}
