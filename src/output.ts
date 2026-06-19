import type { SearchHit } from './types.ts';
import type { IndexResult } from './indexer.ts';

export type SearchPayload = { query: string; count: number; results: SearchHit[] };
export type IndexPayload = { path: string } & IndexResult;

const roundDistance = (hit: SearchHit): SearchHit => ({ ...hit, distance: Number(hit.distance.toFixed(4)) });

export const searchPayload = (query: string, hits: SearchHit[]): SearchPayload => ({
  query,
  count: hits.length,
  results: hits.map(roundDistance),
});

export const indexPayload = (path: string, result: IndexResult): IndexPayload => ({ path, ...result });

export const searchOutputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    count: { type: 'number' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          symbol: { type: 'string' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
          distance: { type: 'number' },
          code: { type: 'string' },
        },
        required: ['path', 'symbol', 'startLine', 'endLine', 'distance', 'code'],
      },
    },
  },
  required: ['query', 'count', 'results'],
};

export const indexOutputSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    added: { type: 'number' },
    skipped: { type: 'number' },
    removed: { type: 'number' },
  },
  required: ['path', 'added', 'skipped', 'removed'],
};
