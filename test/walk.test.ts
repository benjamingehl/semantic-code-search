import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '../src/types.ts';
import { createStore } from '../src/store.ts';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import { createFakeEmbedRequest } from './fakeEmbedder.ts';

const DIM = 64;

let workspace: string;
let repo: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'scs-walk-'));
  repo = join(workspace, 'repo');
  mkdirSync(repo, { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const baseConfig = (): Config => ({
  embedBaseUrl: 'http://fake/v1',
  embedApiKey: 'no-key',
  embedModel: 'fake-model',
  embedDimensions: DIM,
  embedDocPrefix: '',
  embedQueryPrefix: '',
  embedBatchSize: 2,
  embedTokenBudget: 5_000_000,
  indexDbPath: join(workspace, 'code.db'),
});

const writeFile = (relativePath: string, content: string): void => {
  const full = join(repo, relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
};

const fn = (name: string): string => `export const ${name} = (value: number): number => value + 1;\n`;

const indexedPaths = async (): Promise<Set<string>> => {
  const config = baseConfig();
  const fake = createFakeEmbedRequest(DIM);
  const store = createStore(config.indexDbPath, DIM, config.embedModel);
  const embedder = createEmbedder(config, fake.request);
  await indexRepo(store, embedder, repo);
  const hits = await search(store, embedder, 'value', 100);
  store.close();
  return new Set(hits.map((hit) => hit.path));
};

describe('walkRepo ignore handling', () => {
  test('skips files matched by .gitignore', async () => {
    writeFile('keep.ts', fn('keepMe'));
    writeFile('ignored.ts', fn('dropMe'));
    writeFile('.gitignore', 'ignored.ts\n');

    const paths = await indexedPaths();

    expect(paths.has('keep.ts')).toBe(true);
    expect(paths.has('ignored.ts')).toBe(false);
  });

  test('skips files matched by .scsignore', async () => {
    writeFile('keep.ts', fn('keepMe'));
    writeFile('secret.ts', fn('dropMe'));
    writeFile('.scsignore', 'secret.ts\n');

    const paths = await indexedPaths();

    expect(paths.has('keep.ts')).toBe(true);
    expect(paths.has('secret.ts')).toBe(false);
  });

  test('.scsignore negation re-includes a .gitignore-excluded file', async () => {
    writeFile('keep.gen.ts', fn('keepMe'));
    writeFile('special.gen.ts', fn('reIncludeMe'));
    writeFile('.gitignore', '*.gen.ts\n');
    writeFile('.scsignore', '!special.gen.ts\n');

    const paths = await indexedPaths();

    expect(paths.has('special.gen.ts')).toBe(true);
    expect(paths.has('keep.gen.ts')).toBe(false);
  });

  test('built-in directory defaults apply without any ignore files', async () => {
    writeFile('app.ts', fn('appCode'));
    writeFile('node_modules/dep/index.ts', fn('depCode'));

    const paths = await indexedPaths();

    expect(paths.has('app.ts')).toBe(true);
    expect([...paths].some((path) => path.includes('node_modules'))).toBe(false);
  });

  test('excludes sqlite db artifacts even when the db lives inside the indexed root', async () => {
    writeFile('app.ts', fn('appCode'));
    writeFile('code.db', 'not actually a sqlite file, just text');
    writeFile('code.db-wal', '');
    writeFile('code.db-shm', '');

    const paths = await indexedPaths();

    expect(paths.has('app.ts')).toBe(true);
    expect(paths.has('code.db')).toBe(false);
    expect(paths.has('code.db-wal')).toBe(false);
    expect(paths.has('code.db-shm')).toBe(false);
  });
});
