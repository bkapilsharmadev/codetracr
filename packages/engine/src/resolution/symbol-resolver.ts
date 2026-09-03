import { posix } from 'node:path';
import { externalSymbol, moduleSymbol } from '../symbols.ts';
import type { AstFact, Expression, ParsedFile, SymbolRef } from '../types.ts';

interface ImportRecord {
  source: string;
  sourceModule?: string;
  imported: string;
}

interface ValueDeclaration {
  symbol: SymbolRef;
  owner: SymbolRef;
  expression?: Expression;
  typeName?: string;
  index?: number;
  exported: boolean;
}

export interface Resolution {
  kind: 'FUNCTION' | 'METHOD' | 'EXTERNAL';
  symbol: SymbolRef;
  receiverType?: SymbolRef;
}

export class SymbolResolver {
  private readonly files: ParsedFile[];
  private readonly modules: Set<string>;
  private readonly imports = new Map<string, Map<string, ImportRecord>>();
  private readonly reexports = new Map<string, string[]>();
  private readonly classesByModuleName = new Map<string, SymbolRef>();
  private readonly interfacesByModuleName = new Map<string, SymbolRef>();
  private readonly functionsByModuleName = new Map<string, SymbolRef>();
  private readonly functionReturnTypes = new Map<string, string>();
  private readonly functionParametersById = new Map<string, Array<{ name: string; index: number }>>();
  private readonly methodsByClassAndName = new Map<string, SymbolRef>();
  private readonly valuesByScope = new Map<string, Map<string, ValueDeclaration>>();
  private readonly exportedValuesByModuleName = new Map<string, ValueDeclaration>();
  private readonly propertiesByClass = new Map<string, Map<string, ValueDeclaration>>();

  constructor(files: ParsedFile[]) {
    this.files = files;
    this.modules = new Set(files.map((file) => file.file));
    this.indexDeclarations();
    this.indexImports();
  }

  private key(module: string, name: string): string {
    return `${module}\0${name}`;
  }

  private indexDeclarations(): void {
    for (const file of this.files) {
      for (const fact of file.facts) {
        if (fact.kind === 'CLASS' && fact.symbol) {
          this.classesByModuleName.set(this.key(file.file, fact.symbol.name), fact.symbol);
        }
        if (fact.kind === 'INTERFACE' && fact.symbol) {
          this.interfacesByModuleName.set(this.key(file.file, fact.symbol.name), fact.symbol);
        }
        if (fact.kind === 'FUNCTION' && fact.symbol) {
          this.functionsByModuleName.set(this.key(file.file, fact.symbol.name), fact.symbol);
          if (fact.typeAnnotation) this.functionReturnTypes.set(fact.symbol.id, fact.typeAnnotation);
        }
        if (
          fact.kind === 'ARGUMENT' &&
          fact.owner?.kind === 'FUNCTION' &&
          fact.name &&
          fact.index !== undefined
        ) {
          const parameters = this.functionParametersById.get(fact.owner.id) ?? [];
          if (!parameters.some((parameter) => parameter.index === fact.index)) {
            parameters.push({ name: fact.name, index: fact.index });
          }
          this.functionParametersById.set(fact.owner.id, parameters);
        }
        if (fact.kind === 'METHOD' && fact.symbol?.containerId) {
          this.methodsByClassAndName.set(
            `${fact.symbol.containerId}\0${fact.symbol.name.split('.').at(-1)}`,
            fact.symbol,
          );
        }
        if (fact.kind === 'VARIABLE' && fact.symbol && fact.owner && fact.name) {
          const declaration: ValueDeclaration = {
            symbol: fact.symbol,
            owner: fact.owner,
            expression: fact.expression,
            typeName: fact.typeAnnotation,
            index: fact.index,
            exported: fact.exported === true,
          };
          const scope = this.valuesByScope.get(fact.owner.id) ?? new Map();
          scope.set(fact.name, declaration);
          this.valuesByScope.set(fact.owner.id, scope);
          if (declaration.exported && fact.owner.kind === 'MODULE') {
            this.exportedValuesByModuleName.set(this.key(file.file, fact.name), declaration);
          }
        }
        if (fact.kind === 'CLASS_PROPERTY' && fact.symbol && fact.owner && fact.name) {
          const properties = this.propertiesByClass.get(fact.owner.id) ?? new Map();
          properties.set(fact.name, {
            symbol: fact.symbol,
            owner: fact.owner,
            expression: fact.expression,
            typeName: fact.typeAnnotation,
            index: fact.index,
            exported: false,
          });
          this.propertiesByClass.set(fact.owner.id, properties);
        }
      }
    }
  }

  private indexImports(): void {
    for (const file of this.files) {
      const imports = new Map<string, ImportRecord>();
      for (const fact of file.facts) {
        if (fact.kind === 'EXPORT' && fact.source) {
          const sourceModule = this.resolveImportPath(file.file, fact.source);
          if (sourceModule) {
            const modules = this.reexports.get(file.file) ?? [];
            modules.push(sourceModule);
            this.reexports.set(file.file, modules);
          }
          continue;
        }
        if (fact.kind !== 'IMPORT' || !fact.source) continue;
        const sourceModule = this.resolveImportPath(file.file, fact.source);
        for (const binding of fact.bindings ?? []) {
          imports.set(binding.local, {
            source: fact.source,
            sourceModule,
            imported: binding.imported,
          });
        }
      }
      this.imports.set(file.file, imports);
    }
  }

  private resolveImportPath(fromFile: string, source: string): string | undefined {
    if (source.startsWith('@')) {
      const parts = source.split('/');
      const packageName = parts[1];
      if (!packageName) return undefined;
      const subpath = parts.slice(2).join('/');
      const base = `src/packages/${packageName}/src${subpath ? `/${subpath}` : ''}`;
      const packageCandidates = [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
        `${base}/index.jsx`,
      ];
      return packageCandidates.find((candidate) => this.modules.has(candidate));
    }
    if (!source.startsWith('.')) return undefined;
    const joined = posix.normalize(posix.join(posix.dirname(fromFile), source));
    const candidates = [
      joined,
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}.js`,
      `${joined}.jsx`,
      `${joined}/index.ts`,
      `${joined}/index.tsx`,
      `${joined}/index.js`,
      `${joined}/index.jsx`,
      joined.endsWith('.js') ? `${joined.slice(0, -3)}.ts` : '',
    ];
    return candidates.find((candidate) => candidate && this.modules.has(candidate));
  }

  private importedSymbol(file: string, local: string): SymbolRef | ValueDeclaration | undefined {
    const binding = this.imports.get(file)?.get(local);
    if (!binding) return undefined;
    if (!binding.sourceModule) {
      const name = binding.imported === 'default' ? local : binding.imported;
      return externalSymbol(binding.source, name);
    }
    const name = binding.imported === 'default' ? local : binding.imported;
    return this.resolveExportedSymbol(binding.sourceModule, name, new Set());
  }

  private resolveExportedSymbol(
    module: string,
    name: string,
    seen: Set<string>,
  ): SymbolRef | ValueDeclaration | undefined {
    if (seen.has(module)) return undefined;
    seen.add(module);
    const direct =
      this.classesByModuleName.get(this.key(module, name)) ??
      this.interfacesByModuleName.get(this.key(module, name)) ??
      this.functionsByModuleName.get(this.key(module, name)) ??
      this.exportedValuesByModuleName.get(this.key(module, name));
    if (direct) return direct;
    for (const reexportedModule of this.reexports.get(module) ?? []) {
      const reexported = this.resolveExportedSymbol(reexportedModule, name, seen);
      if (reexported) return reexported;
    }
    return undefined;
  }

  private localValue(file: string, scope: SymbolRef, name: string): ValueDeclaration | undefined {
    return (
      this.valuesByScope.get(scope.id)?.get(name) ??
      this.valuesByScope.get(moduleSymbol(file).id)?.get(name)
    );
  }

  private inferDeclarationType(
    file: string,
    declaration: ValueDeclaration,
    seen: Set<string>,
  ): SymbolRef | undefined {
    if (seen.has(declaration.symbol.id)) return undefined;
    seen.add(declaration.symbol.id);
    if (declaration.expression) {
      const inferred = this.resolveExpressionType(file, declaration.owner, declaration.expression, seen);
      if (inferred) return inferred;
    }
    return declaration.typeName
      ? this.resolveTypeName(declaration.symbol.module, declaration.typeName)
      : undefined;
  }

  resolveExpressionType(
    file: string,
    scope: SymbolRef,
    value: Expression,
    seen = new Set<string>(),
  ): SymbolRef | undefined {
    if (value.kind === 'THIS') {
      if (scope.kind !== 'METHOD' || !scope.containerId) return undefined;
      return [...this.classesByModuleName.values()].find(
        (candidate) => candidate.id === scope.containerId,
      );
    }
    if (value.kind === 'IDENTIFIER') {
      const local = this.localValue(file, scope, value.name);
      if (local) return this.inferDeclarationType(file, local, seen);
      const imported = this.importedSymbol(file, value.name);
      if (!imported) return this.classesByModuleName.get(this.key(file, value.name));
      return 'symbol' in imported
        ? this.inferDeclarationType(imported.symbol.module, imported, seen)
        : imported;
    }
    if (value.kind === 'NEW') {
      return this.resolveNamedSymbol(file, value.constructor);
    }
    if (value.kind === 'CALL') {
      const resolved = this.resolveReference(file, scope, value.callee);
      return resolved?.kind === 'EXTERNAL' ? resolved.symbol : undefined;
    }
    if (value.kind === 'MEMBER') {
      const objectType = this.resolveExpressionType(file, scope, value.object, seen);
      if (objectType?.kind !== 'CLASS' && objectType?.kind !== 'INTERFACE') return undefined;
      const property = this.propertiesByClass.get(objectType.id)?.get(value.property);
      return property
        ? this.inferDeclarationType(property.symbol.module, property, seen)
        : undefined;
    }
    return undefined;
  }

  private resolveNamedSymbol(file: string, value: Expression): SymbolRef | undefined {
    if (value.kind !== 'IDENTIFIER') return undefined;
    const imported = this.importedSymbol(file, value.name);
    if (imported && !('symbol' in imported)) return imported;
    if (imported && 'symbol' in imported) return this.inferDeclarationType(file, imported, new Set());
    return this.classesByModuleName.get(this.key(file, value.name));
  }

  resolveReference(
    file: string,
    scope: SymbolRef,
    value: Expression,
  ): Resolution | undefined {
    if (value.kind === 'IDENTIFIER') {
      const imported = this.importedSymbol(file, value.name);
      const symbol =
        imported && !('symbol' in imported)
          ? imported
          : this.functionsByModuleName.get(this.key(file, value.name));
      if (!symbol) return undefined;
      return {
        kind:
          symbol.kind === 'FUNCTION'
            ? 'FUNCTION'
            : symbol.kind === 'EXTERNAL'
              ? 'EXTERNAL'
              : 'METHOD',
        symbol,
      };
    }
    if (value.kind !== 'MEMBER') return undefined;
    if (value.object.kind === 'IDENTIFIER') {
      const binding = this.imports.get(file)?.get(value.object.name);
      if (binding?.sourceModule) {
        const importedName =
          binding.imported === 'default' ? value.object.name : binding.imported;
        const member = this.functionsByModuleName.get(
          this.key(binding.sourceModule, `${importedName}.${value.property}`),
        );
        if (member) return { kind: 'FUNCTION', symbol: member };
      }
      const local = this.localValue(file, scope, value.object.name);
      if (local) {
        const member = this.functionsByModuleName.get(
          this.key(file, `${value.object.name}.${value.property}`),
        );
        if (member) return { kind: 'FUNCTION', symbol: member };
      }
    }
    const receiverType = this.resolveExpressionType(file, scope, value.object);
    if (!receiverType) return undefined;
    if (receiverType.kind === 'EXTERNAL') {
      return {
        kind: 'EXTERNAL',
        receiverType,
        symbol: externalSymbol(receiverType.module, `${receiverType.name}.${value.property}`),
      };
    }
    if (receiverType.kind !== 'CLASS' && receiverType.kind !== 'INTERFACE') return undefined;
    const method = this.methodsByClassAndName.get(`${receiverType.id}\0${value.property}`);
    return method ? { kind: 'METHOD', symbol: method, receiverType } : undefined;
  }

  resolveCall(file: string, fact: AstFact): Resolution | undefined {
    if (fact.kind !== 'CALL' || fact.expression?.kind !== 'CALL' || !fact.owner) return undefined;
    return this.resolveReference(file, fact.owner, fact.expression.callee);
  }

  importedModule(file: string, importedName: string): string | undefined {
    return this.imports.get(file)?.get(importedName)?.sourceModule;
  }

  importBinding(
    file: string,
    localName: string,
  ): { source: string; sourceModule?: string; imported: string } | undefined {
    return this.imports.get(file)?.get(localName);
  }

  resolveTypeName(file: string, name: string): SymbolRef | undefined {
    const imported = this.importedSymbol(file, name);
    if (imported && !('symbol' in imported)) {
      return imported.kind === 'CLASS' || imported.kind === 'INTERFACE' || imported.kind === 'EXTERNAL'
        ? imported
        : undefined;
    }
    return (
      this.classesByModuleName.get(this.key(file, name)) ??
      this.interfacesByModuleName.get(this.key(file, name))
    );
  }

  classProperties(classRef: SymbolRef): Array<{
    symbol: SymbolRef;
    type?: SymbolRef;
    index?: number;
  }> {
    return [...(this.propertiesByClass.get(classRef.id)?.values() ?? [])]
      .map((property) => ({
        symbol: property.symbol,
        type: property.typeName
          ? this.resolveTypeName(property.symbol.module, property.typeName)
          : undefined,
        index: property.index,
      }))
      .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
  }

  methodFor(container: SymbolRef, methodName: string): SymbolRef | undefined {
    return this.methodsByClassAndName.get(`${container.id}\0${methodName}`);
  }

  functionReturnType(functionRef: SymbolRef): SymbolRef | undefined {
    const name = this.functionReturnTypes.get(functionRef.id);
    return name ? this.resolveTypeName(functionRef.module, name) : undefined;
  }

  functionParameters(functionRef: SymbolRef): Array<{ name: string; index: number }> {
    return [...(this.functionParametersById.get(functionRef.id) ?? [])].sort(
      (a, b) => a.index - b.index,
    );
  }

  resolveValueSymbol(
    file: string,
    scope: SymbolRef,
    value: Expression,
  ): SymbolRef | undefined {
    if (value.kind === 'IDENTIFIER') {
      const local = this.localValue(file, scope, value.name);
      if (local) return local.symbol;
      const imported = this.importedSymbol(file, value.name);
      return imported && 'symbol' in imported ? imported.symbol : undefined;
    }
    if (value.kind === 'MEMBER' && value.object.kind === 'THIS') {
      const ownerClass = this.resolveExpressionType(file, scope, value.object);
      return ownerClass
        ? this.propertiesByClass.get(ownerClass.id)?.get(value.property)?.symbol
        : undefined;
    }
    return undefined;
  }

  resolveStaticExpression(
    file: string,
    scope: SymbolRef,
    value: Expression,
    seen = new Set<string>(),
  ): Expression | undefined {
    if (value.kind === 'STRING_LITERAL') return value;
    if (value.kind === 'OBJECT_LITERAL') {
      const entries: Record<string, Expression> = {};
      for (const [key, entry] of Object.entries(value.entries)) {
        const resolved = this.resolveStaticExpression(file, scope, entry, seen);
        if (!resolved) return undefined;
        entries[key] = resolved;
      }
      return { ...value, entries };
    }
    if (
      value.kind === 'CALL' &&
      value.callee.kind === 'MEMBER' &&
      value.callee.object.kind === 'IDENTIFIER' &&
      value.callee.object.name === 'Object' &&
      value.callee.property === 'freeze' &&
      value.arguments[0]
    ) {
      return this.resolveStaticExpression(file, scope, value.arguments[0], seen);
    }
    if (value.kind !== 'IDENTIFIER') return undefined;
    const local = this.localValue(file, scope, value.name);
    const imported = this.importedSymbol(file, value.name);
    const declaration = local ?? (imported && 'symbol' in imported ? imported : undefined);
    if (!declaration?.expression || seen.has(declaration.symbol.id)) return undefined;
    seen.add(declaration.symbol.id);
    return this.resolveStaticExpression(
      declaration.symbol.module,
      declaration.owner,
      declaration.expression,
      seen,
    );
  }
}
