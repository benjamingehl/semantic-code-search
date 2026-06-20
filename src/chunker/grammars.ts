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
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sc': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.pdf': 'pdf',
};

const grammarFiles: Record<string, string> = {
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-tsx',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  csharp: 'tree-sitter-c_sharp',
  ruby: 'tree-sitter-ruby',
  php: 'tree-sitter-php',
  kotlin: 'tree-sitter-kotlin',
  swift: 'tree-sitter-swift',
  scala: 'tree-sitter-scala',
  bash: 'tree-sitter-bash',
};

const parserCache = { initialized: false, parsers: new Map<string, Parser>() };

export const resetParserCache = (): void => {
  parserCache.initialized = false;
  parserCache.parsers.clear();
};

export const languageForPath = (path: string): string | null => extensionToLanguage[extname(path)] ?? null;

export const getParser = async (language: string): Promise<Parser> => {
  if (!parserCache.initialized) {
    await Parser.init();
    parserCache.initialized = true;
  }
  const cached = parserCache.parsers.get(language);
  if (cached) return cached;

  const grammar = grammarFiles[language];
  if (!grammar) throw new Error(`No grammar registered for language "${language}"`);

  const wasmPath = fileURLToPath(import.meta.resolve(`tree-sitter-wasms/out/${grammar}.wasm`));
  const loaded = await Parser.Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(loaded);
  parserCache.parsers.set(language, parser);
  return parser;
};
