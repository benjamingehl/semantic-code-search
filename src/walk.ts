import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ignore from 'ignore';
import { languageForPath } from './chunker/grammars.ts';
import { debugLog } from './debug.ts';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_DOC_BYTES = 5 * 1024 * 1024;

const builtinIgnorePatterns = [
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  'vendor',
  'target',
  '.next',
  '.venv',
  '__pycache__',
  '.cache',
  '*.db',
  '*.db-wal',
  '*.db-shm',
  '*.db-journal',
];

const sizeLimit = (name: string): number => {
  const language = languageForPath(name);
  return language === 'markdown' || language === 'pdf' ? MAX_DOC_BYTES : MAX_FILE_BYTES;
};

export const isProbablyBinary = (buffer: Buffer): boolean => {
  const length = Math.min(buffer.length, 4096);
  for (let i = 0; i < length; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
};

const readIgnoreFile = (root: string, name: string): string => {
  try {
    return readFileSync(join(root, name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};

const buildMatcher = (root: string) =>
  ignore().add(readIgnoreFile(root, '.gitignore')).add(readIgnoreFile(root, '.scsignore')).add(builtinIgnorePatterns);

export const walkRepo = (root: string): string[] => {
  const matcher = buildMatcher(root);
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = relative(root, full);
      if (matcher.ignores(path)) {
        debugLog('excluded', path);
        continue;
      }
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile()) {
        if (statSync(full).size <= sizeLimit(entry.name)) files.push(full);
      }
    }
  };
  visit(root);
  return files;
};
