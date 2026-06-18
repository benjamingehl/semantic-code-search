import type Parser from 'web-tree-sitter';
import { basename } from 'node:path';
import type { Chunk } from '../types.ts';
import { getParser, languageForPath } from './grammars.ts';
import { definitionSymbol } from './queries.ts';

type Node = Parser.SyntaxNode;

const MAX_CHUNK_CHARS = 8000;
const LINES_PER_WINDOW = 80;

export const embedTextFor = (chunk: Chunk): string => `// ${chunk.path}\n${chunk.code}`;

const toChunk = (node: Node, symbol: string, path: string, language: string): Chunk => ({
  symbol,
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
  language,
  path,
  code: node.text,
});

const wholeFileChunk = (path: string, source: string, language: string): Chunk => ({
  symbol: basename(path),
  startLine: 1,
  endLine: Math.max(1, source.split('\n').length),
  language,
  path,
  code: source,
});

const collectDefinitions = (node: Node, path: string, language: string, out: Chunk[]): void => {
  for (const child of node.namedChildren) {
    const symbol = definitionSymbol(child);
    if (symbol !== null) {
      out.push(toChunk(child, symbol, path, language));
    } else {
      collectDefinitions(child, path, language, out);
    }
  }
};

const splitIfOversize = (chunk: Chunk): Chunk[] => {
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

export const chunkFile = async (path: string, source: string): Promise<Chunk[]> => {
  const language = languageForPath(path);
  if (language === null) return [wholeFileChunk(path, source, 'text')];

  const parser = await getParser(language);
  const tree = parser.parse(source);

  const definitions: Chunk[] = [];
  collectDefinitions(tree.rootNode, path, language, definitions);

  if (definitions.length === 0) return [wholeFileChunk(path, source, language)];

  return definitions.flatMap(splitIfOversize);
};
