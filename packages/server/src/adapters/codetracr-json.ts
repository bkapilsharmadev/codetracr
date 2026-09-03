import { readFileSync } from 'node:fs';
import { loadGraphData, type GraphAnalyzerPort, type AnalyzerGraph } from './graph-data.ts';

interface CodeTracrEvidence {
  provider?: string;
  file?: string;
  line?: number;
  column?: number;
}

interface CodeTracrNode {
  id: string;
  type: string;
  name: string;
  file?: string;
  line?: number;
  evidence?: CodeTracrEvidence[];
  [key: string]: unknown;
}

interface CodeTracrOccurrence {
  line?: number;
  column?: number;
  order?: number;
  sourceRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

interface CodeTracrEdge {
  from: string;
  to: string;
  type: string;
  provenance?: {
    evidence?: CodeTracrEvidence[];
    confidence?: number;
    certainty?: 'DEFINITE' | 'POSSIBLE';
    occurrences?: CodeTracrOccurrence[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CodeTracrGraph {
  nodes: CodeTracrNode[];
  edges: CodeTracrEdge[];
}

function evidenceLocation(edge: CodeTracrEdge): CodeTracrEvidence | undefined {
  return (
    edge.provenance?.evidence?.find((evidence) => evidence.provider === 'treesitter') ??
    edge.provenance?.evidence?.[0]
  );
}

export function loadCodeTracrGraph(
  graph: Partial<CodeTracrGraph>,
  source = '<memory>',
): GraphAnalyzerPort {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error(`Invalid CodeTracr graph: expected nodes[] and edges[] in ${source}`);
  }

  const normalized: AnalyzerGraph = {
    nodes: graph.nodes.map((node) => ({
      ...node,
      id: String(node.id),
      label: String(node.name ?? node.id),
      kind: String(node.type ?? 'symbol').toLowerCase(),
      source_file: typeof node.file === 'string' ? node.file : undefined,
      source_location: typeof node.line === 'number' ? `L${node.line}` : undefined,
    })),
    links: graph.edges.map((edge) => {
      const location = evidenceLocation(edge);
      const certainty = edge.provenance?.certainty;
      const confidenceScore = edge.provenance?.confidence;
      return {
        ...edge,
        source: String(edge.from),
        target: String(edge.to),
        relation: String(edge.type),
        certainty,
        confidence_score: confidenceScore,
        confidence: certainty === 'POSSIBLE' ? 'INFERRED' : 'EXTRACTED',
        source_file: location?.file,
        source_location: typeof location?.line === 'number' ? `L${location.line}` : undefined,
        column: typeof location?.column === 'number' ? location.column : undefined,
        occurrences: edge.provenance?.occurrences,
      };
    }),
  };

  return loadGraphData(normalized, 'codetracr');
}

export function loadCodeTracrJsonAdapter(graphJsonPath: string): GraphAnalyzerPort {
  const graph = JSON.parse(readFileSync(graphJsonPath, 'utf8')) as Partial<CodeTracrGraph>;
  return loadCodeTracrGraph(graph, graphJsonPath);
}
