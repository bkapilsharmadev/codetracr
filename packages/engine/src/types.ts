export type SymbolKind =
  | 'MODULE'
  | 'CLASS'
  | 'INTERFACE'
  | 'METHOD'
  | 'FUNCTION'
  | 'VARIABLE'
  | 'CLASS_PROPERTY'
  | 'EXTERNAL';

export interface SymbolRef {
  id: string;
  kind: SymbolKind;
  module: string;
  name: string;
  containerId?: string;
}

export type Expression =
  | { kind: 'IDENTIFIER'; name: string; text: string }
  | { kind: 'THIS'; text: string }
  | { kind: 'MEMBER'; object: Expression; property: string; optional: boolean; text: string }
  | { kind: 'CALL'; callee: Expression; arguments: Expression[]; text: string }
  | { kind: 'NEW'; constructor: Expression; arguments: Expression[]; text: string }
  | { kind: 'STRING_LITERAL'; value: string; text: string }
  | { kind: 'OBJECT_LITERAL'; entries: Record<string, Expression>; text: string }
  | { kind: 'ARRAY_LITERAL'; elements: Expression[]; text: string }
  | {
      kind: 'BINARY';
      left: Expression;
      operator: string;
      right: Expression;
      text: string;
    }
  | { kind: 'UNKNOWN'; syntaxKind: string; text: string };

export interface ImportBinding {
  imported: string;
  local: string;
}

export type FactKind =
  | 'IMPORT'
  | 'EXPORT'
  | 'CLASS'
  | 'INTERFACE'
  | 'CLASS_PROPERTY'
  | 'METHOD'
  | 'FUNCTION'
  | 'VARIABLE'
  | 'CALL'
  | 'MEMBER'
  | 'NEW'
  | 'STRING'
  | 'OBJECT'
  | 'ARGUMENT'
  | 'TYPE_ANNOTATION'
  | 'RETURN'
  | 'CONDITION';

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CallOccurrence {
  line: number;
  column: number;
  order: number;
  sourceRange?: SourceRange;
}

export interface AstFact {
  kind: FactKind;
  line: number;
  column: number;
  sourceRange?: SourceRange;
  symbol?: SymbolRef;
  owner?: SymbolRef;
  source?: string;
  bindings?: ImportBinding[];
  implementedTypes?: string[];
  expression?: Expression;
  condition?: Expression;
  name?: string;
  value?: string;
  typeAnnotation?: string;
  exported?: boolean;
  target?: SymbolRef;
  index?: number;
}

export interface ParsedFile {
  file: string;
  facts: AstFact[];
}

export type NodeType =
  | 'MODULE'
  | 'CLASS'
  | 'INTERFACE'
  | 'CLASS_PROPERTY'
  | 'METHOD'
  | 'FUNCTION'
  | 'HTTP_ENDPOINT'
  | 'DATABASE_TABLE'
  | 'EVENT_TOPIC';

export type EdgeType =
  | 'IMPORTS'
  | 'CALLS'
  | 'HANDLES'
  | 'READS'
  | 'WRITES'
  | 'DEPENDS_ON'
  | 'IMPLEMENTS'
  | 'INJECTED_WITH'
  | 'RESOLVES_TO'
  | 'POSSIBLE_RESOLUTION'
  | 'PUBLISHES'
  | 'CONSUMED_BY';

export interface Evidence {
  provider: 'treesitter';
  file: string;
  line: number;
  column?: number;
}

export interface Derivation {
  kind: 'syntax' | 'symbol-resolution' | 'semantic-rule';
  rule?:
    | 'fastify-route'
    | 'sql-table-access'
    | 'interface-di'
    | 'conditional-factory-analysis'
    | 'kafka-event';
}

export interface Provenance {
  evidence: Evidence[];
  derivation: Derivation;
  confidence: number;
  certainty: 'DEFINITE' | 'POSSIBLE';
  occurrences?: CallOccurrence[];
}

export interface CodeTracrNode {
  id: string;
  type: NodeType;
  name: string;
  file?: string;
  line?: number;
  method?: string;
  path?: string;
  evidence: Evidence[];
}

export interface CodeTracrEdge {
  from: string;
  to: string;
  type: EdgeType;
  provenance: Provenance;
}

export interface CodeTracrGraph {
  nodes: CodeTracrNode[];
  edges: CodeTracrEdge[];
  unresolved: Array<{
    expression: string;
    file: string;
    line: number;
    reason: string;
  }>;
}

