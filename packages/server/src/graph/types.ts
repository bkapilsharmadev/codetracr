export type AnalyzerId = 'codetracr';

export interface GraphNode {
  id: string;
  label: string;
  kind?: string;
  file?: string;
  line?: number;
  raw: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation?: string;
  confidence?: string;
  certainty?: 'DEFINITE' | 'POSSIBLE';
  confidenceScore?: number;
  file?: string;
  line?: number;
  column?: number;
  occurrences?: Array<{
    line: number;
    column: number;
    order: number;
    sourceRange?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  }>;
  raw: Record<string, unknown>;
}

export interface SurfaceImpactEndpoint {
  method: string;
  path: string;
  handler: string;
  evidence: string;
  via?: string[];
}

export interface SurfaceImpactTable {
  name: string;
  via: string[];
  evidence: string;
}

export interface SurfaceImpactKafkaPublish {
  topic: string;
  via: string[];
  evidence: string;
}

export interface SurfaceImpactKafkaConsume {
  topic: string;
  consumer: string;
  callback?: string;
  evidence: string;
}

export interface SurfaceImpactExternal {
  url: string;
  via: string[];
  evidence: string;
}

export interface SurfaceImpactResult {
  target: { id: string; label: string; file?: string; line?: number };
  endpoints: SurfaceImpactEndpoint[];
  tables: SurfaceImpactTable[];
  kafka: {
    publishes: SurfaceImpactKafkaPublish[];
    consumes: SurfaceImpactKafkaConsume[];
  };
  external: SurfaceImpactExternal[];
}
