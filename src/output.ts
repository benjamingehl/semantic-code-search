import { type Static, Type } from '@sinclair/typebox';
import { type IndexResult, type SearchHit, IndexResultSchema, SearchHitSchema } from './types.ts';

export const searchOutputSchema = Type.Object({
  query: Type.String(),
  count: Type.Number(),
  results: Type.Array(SearchHitSchema),
  lastIndexedAt: Type.Union([Type.String(), Type.Null()]),
});
export type SearchPayload = Static<typeof searchOutputSchema>;

export const indexOutputSchema = Type.Composite([Type.Object({ path: Type.String() }), IndexResultSchema]);
export type IndexPayload = Static<typeof indexOutputSchema>;

export const refreshOutputSchema = Type.Composite([IndexResultSchema, Type.Object({ lastIndexedAt: Type.String() })]);
export type RefreshPayload = Static<typeof refreshOutputSchema>;

const roundDistance = (hit: SearchHit): SearchHit => ({ ...hit, distance: Number(hit.distance.toFixed(4)) });

export const searchPayload = (query: string, hits: SearchHit[], lastIndexedAt: string | null): SearchPayload => ({
  query,
  count: hits.length,
  results: hits.map(roundDistance),
  lastIndexedAt,
});

export const indexPayload = (path: string, result: IndexResult): IndexPayload => ({ path, ...result });

export const refreshPayload = (result: IndexResult, lastIndexedAt: string): RefreshPayload => ({
  ...result,
  lastIndexedAt,
});
