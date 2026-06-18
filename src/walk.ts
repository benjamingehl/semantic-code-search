import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

export const walkRepo = (root: string): string[] => {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) visit(full);
      } else if (entry.isFile() && statSync(full).size <= MAX_FILE_BYTES) {
        files.push(full);
      }
    }
  };
  visit(root);
  return files;
};
