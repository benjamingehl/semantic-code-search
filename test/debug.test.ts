import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '../src/types.ts';
import { createStore } from '../src/store.ts';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { createFakeEmbedRequest } from './fakeEmbedder.ts';

const DIM = 64;

let workspace: string;
let repo: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'scs-debug-'));
  repo = join(workspace, 'repo');
  mkdirSync(repo, { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  delete process.env.DEBUG;
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
  writeFileSync(join(repo, relativePath), content);
};

const fn = (name: string): string => `export const ${name} = (value: number): number => value + 1;\n`;

const runIndex = async (): Promise<string[]> => {
  const config = baseConfig();
  const spy = spyOn(console, 'error').mockImplementation(() => {});
  const store = createStore(config.indexDbPath, DIM, config.embedModel);
  await indexRepo(store, createEmbedder(config, createFakeEmbedRequest(DIM).request), repo);
  store.close();
  const lines = spy.mock.calls.map((call) => call.join(' '));
  spy.mockRestore();
  return lines;
};

describe('debug logging', () => {
  beforeEach(() => {
    writeFile('keep.ts', fn('keepMe'));
    writeFile('ignored.ts', fn('dropMe'));
    writeFile('.gitignore', 'ignored.ts\n');
  });

  test('logs indexed and ignore-excluded files when DEBUG is set', async () => {
    process.env.DEBUG = '1';

    const lines = await runIndex();

    expect(lines).toContain('[scs] indexed keep.ts');
    expect(lines).toContain('[scs] excluded ignored.ts');
  });

  test('emits nothing when DEBUG is unset', async () => {
    const lines = await runIndex();

    expect(lines.some((line) => line.startsWith('[scs]'))).toBe(false);
  });
});
