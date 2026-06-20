import { basename } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Chunk } from '../types.ts';
import { splitIfOversize } from './split.ts';

const MIN_PARAGRAPH_CHARS = 3;
const MAX_PROSE_CHUNK_CHARS = 2000;

const headingPattern = /^#{1,6}\s+/;

const splitLong = (text: string, max: number): string[] => {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max);
    const cut = space > 0 ? space : max;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
};

const packParagraphs = (paragraphs: string[], max: number): string[] => {
  const groups: string[] = [];
  for (const paragraph of paragraphs) {
    const last = groups.at(-1);
    if (last && last.length + paragraph.length + 2 <= max) groups[groups.length - 1] = `${last}\n\n${paragraph}`;
    else groups.push(paragraph);
  }
  return groups;
};

export const chunkMarkdown = (path: string, source: string): Chunk[] => {
  const lines = source.split('\n');
  const sections: Chunk[] = [];
  let start = 0;
  let heading = '';

  const close = (end: number): void => {
    const code = lines.slice(start, end).join('\n');
    if (code.trim() === '') return;
    sections.push({
      symbol: heading || basename(path),
      startLine: start + 1,
      endLine: end,
      language: 'markdown',
      path,
      code,
    });
  };

  lines.forEach((line, index) => {
    if (!headingPattern.test(line)) return;
    close(index);
    start = index;
    heading = line.replace(headingPattern, '').trim();
  });
  close(lines.length);

  return sections.flatMap(splitIfOversize);
};

export const chunkDocText = (path: string, language: string, text: string): Chunk[] => {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .flatMap((paragraph) => splitLong(paragraph, MAX_PROSE_CHUNK_CHARS))
    .filter((paragraph) => paragraph.replace(/\s/g, '').length >= MIN_PARAGRAPH_CHARS);

  return packParagraphs(paragraphs, MAX_PROSE_CHUNK_CHARS).map((code, index) => ({
    symbol: `${basename(path)}#${index}`,
    startLine: 1,
    endLine: Math.max(1, code.split('\n').length),
    language,
    path,
    code,
  }));
};

export const chunkPdf = async (path: string, buffer: Buffer): Promise<Chunk[]> => {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return chunkDocText(path, 'pdf', text);
};
