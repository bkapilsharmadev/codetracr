import type { SymbolResolver } from '../resolution/symbol-resolver.ts';
import type { Evidence, Expression, ParsedFile, SymbolRef } from '../types.ts';

export interface SqlAccessFact {
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  table: string;
  owner: SymbolRef;
  evidence: Evidence[];
}

function tableToken(sql: string): string | undefined {
  const tokens: string[] = [];
  let token = '';
  for (const character of sql.trim()) {
    if ([' ', '\n', '\r', '\t'].includes(character)) {
      if (token) tokens.push(token);
      token = '';
    } else {
      token += character;
    }
  }
  if (token) tokens.push(token);
  if (tokens[0]?.toUpperCase() !== 'INSERT' || tokens[1]?.toUpperCase() !== 'INTO') {
    return undefined;
  }
  const candidate = tokens[2];
  if (!candidate) return undefined;
  let table = '';
  for (const character of candidate) {
    const isLetter =
      (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z');
    const isNumber = character >= '0' && character <= '9';
    if (isLetter || isNumber || character === '_') table += character;
    else break;
  }
  return table || undefined;
}

function isRecognizedDatabaseClient(module: string, name: string): boolean {
  return module === 'pg' && (name === 'Pool' || name === 'Client');
}

interface TableCatalog {
  registries: Map<string, Map<string, string>>;
  drizzleTables: Map<string, string>;
}

function uniqueSet(map: Map<string, string>, key: string, value: string): void {
  const existing = map.get(key);
  if (!existing || existing === value) map.set(key, value);
  else map.delete(key);
}

function tableCatalog(files: ParsedFile[], resolver: SymbolResolver): TableCatalog {
  const registries = new Map<string, Map<string, string>>();
  const drizzleTables = new Map<string, string>();

  for (const file of files) {
    for (const fact of file.facts) {
      if (fact.kind !== 'VARIABLE' || !fact.name || !fact.expression) continue;
      const value = fact.expression;

      if (value.kind === 'CALL' && value.callee.kind === 'IDENTIFIER') {
        const binding = resolver.importBinding(file.file, value.callee.name);
        const tableName = value.arguments[0];
        if (
          binding?.source === 'drizzle-orm/pg-core' &&
          binding.imported === 'pgTable' &&
          tableName?.kind === 'STRING_LITERAL'
        ) {
          uniqueSet(drizzleTables, fact.name, tableName.value);
        }
      }

      const frozenObject =
        value.kind === 'CALL' &&
        value.callee.kind === 'MEMBER' &&
        value.callee.object.kind === 'IDENTIFIER' &&
        value.callee.object.name === 'Object' &&
        value.callee.property === 'freeze'
          ? value.arguments[0]
          : value;
      if (frozenObject?.kind !== 'OBJECT_LITERAL') continue;

      const entries = new Map<string, string>();
      for (const [key, entry] of Object.entries(frozenObject.entries)) {
        if (entry.kind !== 'CALL') continue;
        const definition = entry.arguments[0];
        if (definition?.kind !== 'OBJECT_LITERAL') continue;
        const name = definition.entries.name;
        if (name?.kind === 'STRING_LITERAL') entries.set(key, name.value);
      }
      if (entries.size > 0) registries.set(fact.name, entries);
    }
  }
  return { registries, drizzleTables };
}

function tableFromExpression(
  file: string,
  expression: Expression,
  catalog: TableCatalog,
  resolver: SymbolResolver,
): string | undefined {
  if (expression.kind === 'MEMBER' && expression.object.kind === 'IDENTIFIER') {
    const binding = resolver.importBinding(file, expression.object.name);
    const registryName =
      binding?.imported === 'default' || !binding
        ? expression.object.name
        : binding.imported;
    return catalog.registries.get(registryName)?.get(expression.property);
  }
  if (expression.kind === 'IDENTIFIER') {
    const binding = resolver.importBinding(file, expression.name);
    const tableName =
      binding?.imported === 'default' || !binding ? expression.name : binding.imported;
    return catalog.drizzleTables.get(tableName);
  }
  return undefined;
}

export function analyzeSql(files: ParsedFile[], resolver: SymbolResolver): SqlAccessFact[] {
  const accesses: SqlAccessFact[] = [];
  const catalog = tableCatalog(files, resolver);
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
      const method = fact.expression.callee.property;
      let operation: SqlAccessFact['operation'] | undefined;
      let table: string | undefined;

      if (method === 'query') {
        const resolved = resolver.resolveCall(file.file, fact);
        if (
          resolved?.kind === 'EXTERNAL' &&
          resolved.receiverType &&
          isRecognizedDatabaseClient(resolved.receiverType.module, resolved.receiverType.name)
        ) {
          const sql = fact.expression.arguments[0];
          if (sql?.kind === 'STRING_LITERAL') {
            table = tableToken(sql.value);
            operation = table ? 'INSERT' : undefined;
          }
        }
      }

      const operationByMethod: Record<string, SqlAccessFact['operation']> = {
        read: 'SELECT',
        select: 'SELECT',
        exists: 'SELECT',
        paginate: 'SELECT',
        aggregate: 'SELECT',
        search: 'SELECT',
        insert: 'INSERT',
        update: 'UPDATE',
        delete: 'DELETE',
        upsert: 'UPSERT',
      };
      const structuredOperation = operationByMethod[method];
      if (structuredOperation) {
        const first = fact.expression.arguments[0];
        const second = fact.expression.arguments[1];
        const options =
          second?.kind === 'OBJECT_LITERAL'
            ? second
            : first?.kind === 'OBJECT_LITERAL'
              ? first
              : undefined;
        const tableExpression = options?.entries.table ?? first;
        if (tableExpression) {
          table = tableFromExpression(file.file, tableExpression, catalog, resolver);
          if (table) operation = structuredOperation;
        }
      }

      if (!table || !operation) continue;
      accesses.push({
        operation,
        table,
        owner: fact.owner,
        evidence: [
          {
            provider: 'treesitter',
            file: file.file,
            line: fact.line,
            column: fact.column,
          },
        ],
      });
    }
  }
  return accesses;
}
