import { type Static, Type } from '@sinclair/typebox';

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

export const SearchHitSchema = Type.Object({
  path: Type.String(),
  symbol: Type.String(),
  startLine: Type.Number(),
  endLine: Type.Number(),
  distance: Type.Number(),
  language: Type.String(),
  content: Type.String(),
});
export type SearchHit = Static<typeof SearchHitSchema>;

export const IndexResultSchema = Type.Object({
  added: Type.Number(),
  skipped: Type.Number(),
  removed: Type.Number(),
});
export type IndexResult = Static<typeof IndexResultSchema>;

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
