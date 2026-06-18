import type { EmbedRequest } from '../src/embedder.ts';

const tokenize = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const hashToken = (token: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash ^ token.charCodeAt(i)) >>> 0;
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
};

export const vectorFor = (text: string, dim: number): number[] => {
  const vector = new Array<number>(dim).fill(0);
  for (const token of tokenize(text)) {
    const bucket = hashToken(token) % dim;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  vector[0] = (vector[0] ?? 0) + 1e-6;
  return vector;
};

export type RecordingEmbedRequest = {
  request: EmbedRequest;
  inputs: string[];
};

export const createFakeEmbedRequest = (dim: number): RecordingEmbedRequest => {
  const inputs: string[] = [];
  const request: EmbedRequest = async (texts) => {
    inputs.push(...texts);
    return texts.map((text) => vectorFor(text, dim));
  };
  return { request, inputs };
};
