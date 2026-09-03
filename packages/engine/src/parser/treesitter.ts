import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import {
  classSymbol,
  functionSymbol,
  interfaceMethodSymbol,
  interfaceSymbol,
  methodSymbol,
  moduleSymbol,
  propertySymbol,
  variableSymbol,
} from '../symbols.ts';
import type { AstFact, Expression, ImportBinding, ParsedFile, SymbolRef } from '../types.ts';

type SyntaxNode = Parser.SyntaxNode;

const parser = new Parser();

type TreeSitterLanguage = Parameters<Parser['setLanguage']>[0];

function languageForPath(filePath: string): TreeSitterLanguage {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return TypeScript.tsx;
  if (lower.endsWith('.ts')) return TypeScript.typescript;
  return JavaScript;
}

function location(node: SyntaxNode): Pick<AstFact, 'line' | 'column'> {
  return { line: node.startPosition.row + 1, column: node.startPosition.column + 1 };
}

function sourceRange(node: SyntaxNode): AstFact['sourceRange'] {
  return {
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1,
  };
}

function unquote(text: string): string {
  const first = text[0];
  return first && first === text[text.length - 1] && ['"', "'", '`'].includes(first)
    ? text.slice(1, -1)
    : text;
}

function ancestor(node: SyntaxNode, type: string): SyntaxNode | undefined {
  let current = node.parent;
  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }
  return undefined;
}

function isExported(node: SyntaxNode): boolean {
  let current: SyntaxNode | null = node;
  while (current && !['program', 'statement_block', 'class_body'].includes(current.type)) {
    if (current.type === 'export_statement') return true;
    current = current.parent;
  }
  return false;
}

function classNameOf(node: SyntaxNode): string | undefined {
  return ancestor(node, 'class_declaration')?.childForFieldName('name')?.text;
}

function interfaceNameOf(node: SyntaxNode): string | undefined {
  return ancestor(node, 'interface_declaration')?.childForFieldName('name')?.text;
}

function objectMemberFunction(node: SyntaxNode, module: string): SymbolRef | undefined {
  let current: SyntaxNode | null = node;
  let pair: SyntaxNode | null = null;
  while (current && current.type !== 'program' && current.type !== 'statement_block') {
    if (current.type === 'pair') pair = current;
    if (pair && current.type === 'variable_declarator') {
      const variableName = current.childForFieldName('name')?.text;
      const propertyName = pair.childForFieldName('key')?.text;
      if (variableName && propertyName) {
        return functionSymbol(module, `${variableName}.${unquote(propertyName)}`);
      }
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function ownerOf(node: SyntaxNode, module: string): SymbolRef {
  let current = node.parent;
  while (current) {
    if (current.type === 'method_definition') {
      const method = current.childForFieldName('name')?.text;
      const className = classNameOf(current);
      if (className && method) return methodSymbol(module, className, method);
    }
    if (current.type === 'function_declaration') {
      const name = current.childForFieldName('name')?.text;
      if (name) return functionSymbol(module, name);
    }
    if (current.type === 'arrow_function' || current.type === 'function_expression') {
      const member = objectMemberFunction(current, module);
      if (member) return member;
    }
    current = current.parent;
  }
  return moduleSymbol(module);
}

function typeAnnotation(node: SyntaxNode): string | undefined {
  const annotation = node.childForFieldName('type');
  if (!annotation) return undefined;
  return annotation.type === 'type_annotation'
    ? (annotation.lastNamedChild?.text ?? annotation.text)
    : annotation.text;
}

function returnTypeAnnotation(node: SyntaxNode): string | undefined {
  const annotation = node.childForFieldName('return_type');
  if (!annotation) return undefined;
  return annotation.type === 'type_annotation'
    ? (annotation.lastNamedChild?.text ?? annotation.text)
    : annotation.text;
}

function expression(node: SyntaxNode | null): Expression {
  if (!node) return { kind: 'UNKNOWN', syntaxKind: 'missing', text: '' };
  switch (node.type) {
    case 'identifier':
    case 'property_identifier':
      return { kind: 'IDENTIFIER', name: node.text, text: node.text };
    case 'this':
      return { kind: 'THIS', text: node.text };
    case 'member_expression': {
      const object = expression(node.childForFieldName('object'));
      const property = node.childForFieldName('property')?.text ?? '';
      return {
        kind: 'MEMBER',
        object,
        property,
        optional: node.children.some((child) => child.type === 'optional_chain'),
        text: node.text,
      };
    }
    case 'subscript_expression':
      return {
        kind: 'UNKNOWN',
        syntaxKind: 'computed_member',
        text: node.text,
      };
    case 'call_expression': {
      const args = node.childForFieldName('arguments');
      return {
        kind: 'CALL',
        callee: expression(node.childForFieldName('function')),
        arguments: args?.namedChildren.map((child) => expression(child)) ?? [],
        text: node.text,
      };
    }
    case 'new_expression': {
      const args = node.childForFieldName('arguments');
      return {
        kind: 'NEW',
        constructor: expression(node.childForFieldName('constructor')),
        arguments: args?.namedChildren.map((child) => expression(child)) ?? [],
        text: node.text,
      };
    }
    case 'string':
    case 'template_string':
      return { kind: 'STRING_LITERAL', value: unquote(node.text), text: node.text };
    case 'object': {
      const entries: Record<string, Expression> = {};
      for (const pair of node.namedChildren.filter((child) => child.type === 'pair')) {
        const key = pair.childForFieldName('key')?.text;
        if (key) entries[unquote(key)] = expression(pair.childForFieldName('value'));
      }
      for (const shorthand of node.namedChildren.filter(
        (child) => child.type === 'shorthand_property_identifier',
      )) {
        entries[shorthand.text] = {
          kind: 'IDENTIFIER',
          name: shorthand.text,
          text: shorthand.text,
        };
      }
      return { kind: 'OBJECT_LITERAL', entries, text: node.text };
    }
    case 'array':
      return {
        kind: 'ARRAY_LITERAL',
        elements: node.namedChildren.map((child) => expression(child)),
        text: node.text,
      };
    case 'binary_expression': {
      const operator = node.children.find((child) =>
        ['===', '!==', '==', '!=', '>', '>=', '<', '<='].includes(child.type),
      );
      return {
        kind: 'BINARY',
        left: expression(node.childForFieldName('left')),
        operator: operator?.type ?? '',
        right: expression(node.childForFieldName('right')),
        text: node.text,
      };
    }
    case 'parenthesized_expression':
      return expression(node.firstNamedChild);
    default:
      return { kind: 'UNKNOWN', syntaxKind: node.type, text: node.text };
  }
}

function importBindings(node: SyntaxNode): ImportBinding[] {
  const clause = node.namedChildren.find((child) => child.type === 'import_clause');
  if (!clause) return [];
  const bindings: ImportBinding[] = [];
  for (const child of clause.namedChildren) {
    if (child.type === 'identifier') {
      bindings.push({ imported: 'default', local: child.text });
    }
    if (child.type === 'namespace_import') {
      const local = child.namedChildren.find((part) => part.type === 'identifier');
      if (local) bindings.push({ imported: '*', local: local.text });
    }
  }
  for (const specifier of clause.descendantsOfType('import_specifier')) {
    const imported = specifier.childForFieldName('name')?.text;
    const local = specifier.childForFieldName('alias')?.text ?? imported;
    if (imported && local) bindings.push({ imported, local });
  }
  return bindings;
}

function addParameters(
  node: SyntaxNode,
  owner: SymbolRef,
  facts: AstFact[],
): void {
  const parameters = node.childForFieldName('parameters');
  if (!parameters) return;
  parameters.namedChildren.forEach((parameter, index) => {
    const name =
      parameter.childForFieldName('pattern')?.text ??
      parameter.childForFieldName('name')?.text ??
      parameter.text;
    const annotation = typeAnnotation(parameter);
    facts.push({
      kind: 'ARGUMENT',
      ...location(parameter),
      owner,
      name,
      typeAnnotation: annotation,
      index,
    });
    if (annotation) {
      facts.push({
        kind: 'TYPE_ANNOTATION',
        ...location(parameter),
        owner,
        name,
        typeAnnotation: annotation,
      });
    }
    const constructorClass =
      owner.kind === 'METHOD' && owner.name.endsWith('.constructor')
        ? owner.name.slice(0, -'.constructor'.length)
        : undefined;
    if (
      constructorClass &&
      parameter.children.some((child) => child.type === 'accessibility_modifier')
    ) {
      facts.push({
        kind: 'CLASS_PROPERTY',
        ...location(parameter),
        symbol: propertySymbol(owner.module, constructorClass, name),
        owner: classSymbol(owner.module, constructorClass),
        name,
        typeAnnotation: annotation,
        index,
      });
    }
  });
}

function visit(node: SyntaxNode, module: string, facts: AstFact[]): void {
  const at = location(node);
  switch (node.type) {
    case 'import_statement':
      facts.push({
        kind: 'IMPORT',
        ...at,
        owner: moduleSymbol(module),
        source: unquote(node.childForFieldName('source')?.text ?? ''),
        bindings: importBindings(node),
      });
      break;
    case 'export_statement': {
      const source = node.childForFieldName('source');
      facts.push({
        kind: 'EXPORT',
        ...at,
        owner: moduleSymbol(module),
        source: source ? unquote(source.text) : undefined,
      });
      break;
    }
    case 'class_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const implementsClause = node.descendantsOfType('implements_clause')[0];
        facts.push({
          kind: 'CLASS',
          ...at,
          symbol: classSymbol(module, name),
          name,
          exported: isExported(node),
          implementedTypes:
            implementsClause?.namedChildren.map((child) => child.text) ?? [],
        });
      }
      break;
    }
    case 'interface_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        facts.push({
          kind: 'INTERFACE',
          ...at,
          symbol: interfaceSymbol(module, name),
          name,
          exported: isExported(node),
        });
      }
      break;
    }
    case 'method_definition': {
      const name = node.childForFieldName('name')?.text;
      const className = classNameOf(node);
      if (name && className) {
        const symbol = methodSymbol(module, className, name);
        facts.push({ kind: 'METHOD', ...at, symbol, owner: classSymbol(module, className), name });
        addParameters(node, symbol, facts);
      }
      break;
    }
    case 'method_signature': {
      const name = node.childForFieldName('name')?.text;
      const interfaceName = interfaceNameOf(node);
      if (name && interfaceName) {
        const symbol = interfaceMethodSymbol(module, interfaceName, name);
        facts.push({
          kind: 'METHOD',
          ...at,
          symbol,
          owner: interfaceSymbol(module, interfaceName),
          name,
        });
        addParameters(node, symbol, facts);
      }
      break;
    }
    case 'function_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const symbol = functionSymbol(module, name);
        facts.push({
          kind: 'FUNCTION',
          ...at,
          symbol,
          owner: moduleSymbol(module),
          name,
          exported: isExported(node),
          typeAnnotation: returnTypeAnnotation(node),
        });
        addParameters(node, symbol, facts);
      }
      break;
    }
    case 'arrow_function':
    case 'function_expression': {
      const symbol = objectMemberFunction(node, module);
      if (symbol) {
        facts.push({
          kind: 'FUNCTION',
          ...at,
          symbol,
          owner: moduleSymbol(module),
          name: symbol.name,
          exported: isExported(node),
        });
        addParameters(node, symbol, facts);
      }
      break;
    }
    case 'public_field_definition': {
      const name = node.childForFieldName('name')?.text;
      const className = classNameOf(node);
      if (name && className) {
        facts.push({
          kind: 'CLASS_PROPERTY',
          ...at,
          symbol: propertySymbol(module, className, name),
          owner: classSymbol(module, className),
          name,
          expression: expression(node.childForFieldName('value')),
          typeAnnotation: typeAnnotation(node),
        });
      }
      break;
    }
    case 'variable_declarator': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const owner = ownerOf(node, module);
        facts.push({
          kind: 'VARIABLE',
          ...at,
          symbol: variableSymbol(module, owner, name),
          owner,
          name,
          expression: expression(node.childForFieldName('value')),
          exported: isExported(node),
        });
      }
      break;
    }
    case 'call_expression': {
      const call = expression(node);
      facts.push({
        kind: 'CALL',
        ...at,
        sourceRange: sourceRange(node),
        owner: ownerOf(node, module),
        expression: call,
      });
      if (call.kind === 'CALL') {
        call.arguments.forEach((argument, index) => {
          facts.push({
            kind: 'ARGUMENT',
            ...location(node.childForFieldName('arguments')!.namedChildren[index]!),
            owner: ownerOf(node, module),
            expression: argument,
            index,
          });
        });
      }
      break;
    }
    case 'member_expression':
      facts.push({ kind: 'MEMBER', ...at, owner: ownerOf(node, module), expression: expression(node) });
      break;
    case 'new_expression':
      facts.push({ kind: 'NEW', ...at, owner: ownerOf(node, module), expression: expression(node) });
      break;
    case 'string':
    case 'template_string': {
      const value = expression(node);
      facts.push({
        kind: 'STRING',
        ...at,
        owner: ownerOf(node, module),
        expression: value,
        value: value.kind === 'STRING_LITERAL' ? value.value : undefined,
      });
      break;
    }
    case 'object':
      facts.push({ kind: 'OBJECT', ...at, owner: ownerOf(node, module), expression: expression(node) });
      break;
    case 'if_statement':
      facts.push({
        kind: 'CONDITION',
        ...at,
        owner: ownerOf(node, module),
        expression: expression(node.childForFieldName('condition')),
      });
      break;
    case 'return_statement': {
      const ifStatement = ancestor(node, 'if_statement');
      facts.push({
        kind: 'RETURN',
        ...at,
        owner: ownerOf(node, module),
        expression: expression(node.firstNamedChild),
        condition: ifStatement
          ? expression(ifStatement.childForFieldName('condition'))
          : undefined,
      });
      break;
    }
  }
  for (const child of node.namedChildren) visit(child, module, facts);
}

export function parseSource(source: string, displayPath: string): ParsedFile {
  const module = displayPath.replaceAll('\\', '/');
  parser.setLanguage(languageForPath(module));
  // Default tree-sitter buffer is too small for large application files.
  const tree = parser.parse(source, undefined, { bufferSize: 1024 * 1024 });
  if (tree.rootNode.hasError) throw new Error(`Tree-sitter could not parse ${module}`);
  const facts: AstFact[] = [];
  visit(tree.rootNode, module, facts);
  return { file: module, facts };
}

export function parseTypeScriptSource(source: string, displayPath: string): ParsedFile {
  return parseSource(source, displayPath);
}

export function parseTypeScript(filePath: string, displayPath: string): ParsedFile {
  return parseSource(readFileSync(filePath, 'utf8'), displayPath);
}

export function parseFile(filePath: string, displayPath: string): ParsedFile {
  return parseSource(readFileSync(filePath, 'utf8'), displayPath);
}

function isAnalyzedSourceFile(name: string): boolean {
  if (name.endsWith('.d.ts')) return false;
  if (name.endsWith('.min.js') || name.endsWith('.min.jsx')) return false;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(name)) return false;
  return (
    name.endsWith('.ts') ||
    name.endsWith('.js') ||
    name.endsWith('.tsx') ||
    name.endsWith('.jsx')
  );
}

export function parseFixture(sourceRoot: string, displayPrefix = 'src'): ParsedFile[] {
  const absoluteRoot = resolve(sourceRoot);
  const prefix = displayPrefix.replace(/\/+$/, '');
  const files: string[] = [];
  const collect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.name === 'graphify-out' ||
        entry.name === '.codegraph' ||
        entry.name === 'node_modules' ||
        entry.name === 'vendor' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage' ||
        entry.name === '.git' ||
        entry.name === '.cursor' ||
        entry.name === '.next' ||
        entry.name === '.turbo'
      ) {
        continue;
      }
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (entry.isFile() && isAnalyzedSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  collect(absoluteRoot);

  const parsed: ParsedFile[] = [];
  const skipped: string[] = [];
  for (const file of files.sort()) {
    const displayPath = `${prefix}/${relative(absoluteRoot, file).replaceAll('\\', '/')}`;
    try {
      parsed.push(parseFile(file, displayPath));
    } catch (error) {
      skipped.push(displayPath);
      console.warn(
        `  skip ${displayPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (skipped.length) {
    console.warn(`  Tree-sitter skipped ${skipped.length}/${files.length} files`);
  }
  return parsed;
}
