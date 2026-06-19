import type Parser from 'web-tree-sitter';
import { basename } from 'node:path';
import type { Chunk } from '../types.ts';
import { getParser, languageForPath } from './grammars.ts';
import { definitionSymbol } from './queries.ts';

type Node = Parser.SyntaxNode;
type Ctx = { path: string; language: string; lines: string[] };

const MAX_CHUNK_CHARS = 8000;
const LINES_PER_WINDOW = 80;

const typeContainerTypes = new Set([
  'class',
  'class_declaration',
  'abstract_class_declaration',
  'class_definition',
  'class_specifier',
  'impl_item',
  'object_declaration',
  'object_definition',
]);

const transparentContainerTypes = new Set(['module', 'mod_item', 'namespace_definition']);

export const embedTextFor = (chunk: Chunk): string => `// ${chunk.path}\n${chunk.code}`;

const qualify = (prefix: string, symbol: string): string => (prefix ? `${prefix}.${symbol}` : symbol);

const hasCode = (text: string): boolean => text.replace(/[\s{}()[\];,]/g, '').replace(/end/g, '') !== '';

const toChunk = (node: Node, symbol: string, ctx: Ctx): Chunk => ({
  symbol,
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
  language: ctx.language,
  path: ctx.path,
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

const leftoverChunks = (container: Node, qualified: string, members: Chunk[], ctx: Ctx): Chunk[] => {
  const end = container.endPosition.row + 1;
  const memberRanges = members.map((member) => [member.startLine, member.endLine]).sort((a, b) => a[0]! - b[0]!);

  const chunks: Chunk[] = [];
  const emitChunk = (from: number, to: number): void => {
    const code = ctx.lines.slice(from - 1, to).join('\n');
    if (!hasCode(code)) return;
    chunks.push({
      symbol: chunks.length === 0 ? qualified : `${qualified}#fields${chunks.length}`,
      startLine: from,
      endLine: to,
      language: ctx.language,
      path: ctx.path,
      code,
    });
  };

  let cursor = container.startPosition.row + 1;
  for (const [memberStart, memberEnd] of memberRanges) {
    if (memberStart! > cursor) emitChunk(cursor, memberStart! - 1);
    cursor = Math.max(cursor, memberEnd! + 1);
  }
  if (cursor <= end) emitChunk(cursor, end);

  return chunks;
};

const collectDefinitions = (node: Node, prefix: string, out: Chunk[], ctx: Ctx): void => {
  for (const child of node.namedChildren) {
    const symbol = definitionSymbol(child);

    if (symbol === null) {
      collectDefinitions(child, prefix, out, ctx);
      continue;
    }

    const qualified = qualify(prefix, symbol);

    if (transparentContainerTypes.has(child.type)) {
      const before = out.length;
      collectDefinitions(child, prefix, out, ctx);
      if (out.length === before) out.push(toChunk(child, qualified, ctx));
      continue;
    }

    if (typeContainerTypes.has(child.type)) {
      const before = out.length;
      collectDefinitions(child, qualified, out, ctx);
      if (out.length === before) out.push(toChunk(child, qualified, ctx));
      else out.push(...leftoverChunks(child, qualified, out.slice(before), ctx));
      continue;
    }

    out.push(toChunk(child, qualified, ctx));
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
  collectDefinitions(tree.rootNode, '', definitions, { path, language, lines: source.split('\n') });

  if (definitions.length === 0) return [wholeFileChunk(path, source, language)];

  return definitions.flatMap(splitIfOversize);
};
