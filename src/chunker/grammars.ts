import Parser from 'web-tree-sitter';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionToLanguage: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
};

const grammarFiles: Record<string, string> = {
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-tsx',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
};

let initialized = false;
const parserCache = new Map<string, Parser>();

export const languageForPath = (path: string): string | null => extensionToLanguage[extname(path)] ?? null;

export const getParser = async (language: string): Promise<Parser> => {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  const cached = parserCache.get(language);
  if (cached) return cached;

  const grammar = grammarFiles[language];
  if (!grammar) throw new Error(`No grammar registered for language "${language}"`);

  const wasmPath = fileURLToPath(import.meta.resolve(`tree-sitter-wasms/out/${grammar}.wasm`));
  const loaded = await Parser.Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(loaded);
  parserCache.set(language, parser);
  return parser;
};
