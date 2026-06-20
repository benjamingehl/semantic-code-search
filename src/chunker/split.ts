import type { Chunk } from '../types.ts';

const MAX_CHUNK_CHARS = 8000;
const LINES_PER_WINDOW = 80;

export const splitIfOversize = (chunk: Chunk): Chunk[] => {
  if (chunk.code.length <= MAX_CHUNK_CHARS) return [chunk];

  const lines = chunk.code.split('\n');
  const windows: Chunk[] = [];
  for (let offset = 0; offset < lines.length; offset += LINES_PER_WINDOW) {
    const slice = lines.slice(offset, offset + LINES_PER_WINDOW);
    windows.push({
      ...chunk,
      symbol: `${chunk.symbol}#${windows.length}`,
      startLine: chunk.startLine + offset,
      endLine: chunk.startLine + offset + slice.length - 1,
      code: slice.join('\n'),
    });
  }
  return windows;
};
