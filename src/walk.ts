import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ignore from 'ignore';

const ignoredDirs = new Set([
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
]);

const MAX_FILE_BYTES = 512 * 1024;

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
  ignore().add(readIgnoreFile(root, '.gitignore')).add(readIgnoreFile(root, '.scsignore'));

export const walkRepo = (root: string): string[] => {
  const matcher = buildMatcher(root);
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = relative(root, full);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name) && !matcher.ignores(path)) visit(full);
      } else if (entry.isFile() && !matcher.ignores(path) && statSync(full).size <= MAX_FILE_BYTES) {
        files.push(full);
      }
    }
  };
  visit(root);
  return files;
};
