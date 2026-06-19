export type Embedder = {
  embedDocs: (texts: string[]) => Promise<number[][]>;
  embedQuery: (text: string) => Promise<number[]>;
};

export type Chunk = {
  symbol: string;
  startLine: number;
  endLine: number;
  language: string;
  path: string;
  code: string;
};

export type SearchHit = {
  path: string;
  symbol: string;
  startLine: number;
  endLine: number;
  distance: number;
  code: string;
};

export type Config = {
  embedBaseUrl: string;
  embedApiKey: string;
  embedModel: string;
  embedDimensions: number;
  embedDocPrefix: string;
  embedQueryPrefix: string;
  embedBatchSize: number;
  embedTokenBudget: number;
  indexDbPath: string;
};
