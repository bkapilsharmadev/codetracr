import type { SymbolKind, SymbolRef } from './types.ts';

export function moduleSymbol(module: string): SymbolRef {
  return { id: `module:${module}`, kind: 'MODULE', module, name: module };
}

export function classSymbol(module: string, name: string): SymbolRef {
  return { id: `class:${module}#${name}`, kind: 'CLASS', module, name };
}

export function interfaceSymbol(module: string, name: string): SymbolRef {
  return { id: `interface:${module}#${name}`, kind: 'INTERFACE', module, name };
}

export function methodSymbol(module: string, className: string, name: string): SymbolRef {
  const container = classSymbol(module, className);
  return {
    id: `method:${module}#${className}.${name}`,
    kind: 'METHOD',
    module,
    name: `${className}.${name}`,
    containerId: container.id,
  };
}

export function interfaceMethodSymbol(
  module: string,
  interfaceName: string,
  name: string,
): SymbolRef {
  const container = interfaceSymbol(module, interfaceName);
  return {
    id: `method:${module}#${interfaceName}.${name}`,
    kind: 'METHOD',
    module,
    name: `${interfaceName}.${name}`,
    containerId: container.id,
  };
}

export function functionSymbol(module: string, name: string): SymbolRef {
  return { id: `function:${module}#${name}`, kind: 'FUNCTION', module, name };
}

export function variableSymbol(module: string, scope: SymbolRef, name: string): SymbolRef {
  return {
    id: `variable:${module}#${scope.id}/${name}`,
    kind: 'VARIABLE',
    module,
    name,
    containerId: scope.id,
  };
}

export function propertySymbol(module: string, className: string, name: string): SymbolRef {
  const container = classSymbol(module, className);
  return {
    id: `property:${module}#${className}.${name}`,
    kind: 'CLASS_PROPERTY',
    module,
    name,
    containerId: container.id,
  };
}

export function externalSymbol(source: string, name: string): SymbolRef {
  return {
    id: `external:${source}#${name}`,
    kind: 'EXTERNAL',
    module: source,
    name,
  };
}

export function sameSymbol(a: SymbolRef | undefined, b: SymbolRef | undefined): boolean {
  return Boolean(a && b && a.id === b.id);
}

export function callableNodeType(kind: SymbolKind): 'METHOD' | 'FUNCTION' | undefined {
  return kind === 'METHOD' || kind === 'FUNCTION' ? kind : undefined;
}
