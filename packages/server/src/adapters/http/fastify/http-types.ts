export interface AnalyzerQuery {
  analyzer?: string;
}

export interface SearchQuery extends AnalyzerQuery {
  q?: string;
  limit?: string;
}

export interface SymbolsQuery extends AnalyzerQuery {
  limit?: string;
}

export interface DepthQuery extends AnalyzerQuery {
  depth?: string;
}

export interface SearchResponse<T> {
  analyzer: string;
  query: string;
  results: T[];
}

export interface SymbolsResponse<T> {
  analyzer: string;
  results: T[];
}

export interface NodeResponse<T> {
  analyzer: string;
  node: T;
}

export interface NeighborsResponse<TNode, TEdge> {
  analyzer: string;
  id: string;
  nodes: TNode[];
  edges: TEdge[];
}

export interface ErrorBody {
  error: string;
  id?: string;
  path?: string;
}
