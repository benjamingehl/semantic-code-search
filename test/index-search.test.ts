import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '../src/types.ts';
import { createStore } from '../src/store.ts';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import { createFakeEmbedRequest, vectorFor } from './fakeEmbedder.ts';

const DIM = 64;
const fixturesDir = join(import.meta.dir, 'fixtures');

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'scs-test-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const baseConfig = (overrides: Partial<Config> = {}): Config => ({
  embedBaseUrl: 'http://fake/v1',
  embedApiKey: 'no-key',
  embedModel: 'fake-model',
  embedDimensions: DIM,
  embedDocPrefix: '',
  embedQueryPrefix: '',
  embedBatchSize: 2,
  indexDbPath: join(workspace, 'code.db'),
  ...overrides,
});

const repoCopy = (): string => {
  const repo = join(workspace, 'repo');
  cpSync(fixturesDir, repo, { recursive: true });
  return repo;
};

describe('indexRepo', () => {
  test('indexes one chunk per code unit and embeds path-prefixed text', async () => {
    const config = baseConfig();
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(config.indexDbPath, DIM, config.embedModel);

    const result = await indexRepo(store, createEmbedder(config, fake.request), fixturesDir);

    // 4 (webhooks.ts) + 3 (users.py) + 1 (settings.json) + 1 (broken.ts)
    expect(result.added).toBe(9);
    expect(result.removed).toBe(0);
    expect(fake.inputs).toHaveLength(9);
    expect(fake.inputs.every((text) => text.startsWith('// '))).toBe(true);
    store.close();
  });

  test('re-indexing an unchanged repo embeds nothing new', async () => {
    const config = baseConfig();
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(config.indexDbPath, DIM, config.embedModel);
    const embedder = createEmbedder(config, fake.request);

    await indexRepo(store, embedder, fixturesDir);
    const embeddedAfterFirst = fake.inputs.length;

    const second = await indexRepo(store, embedder, fixturesDir);

    expect(second.added).toBe(0);
    expect(second.removed).toBe(0);
    expect(fake.inputs.length).toBe(embeddedAfterFirst);
    store.close();
  });

  test('editing a function re-embeds only that chunk and drops the stale one', async () => {
    const config = baseConfig();
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(config.indexDbPath, DIM, config.embedModel);
    const embedder = createEmbedder(config, fake.request);
    const repo = repoCopy();

    await indexRepo(store, embedder, repo);
    const embeddedAfterFirst = fake.inputs.length;

    const target = join(repo, 'webhooks.ts');
    const edited = readFileSync(target, 'utf8').replace('let delay = 100;', 'let delay = 4242; // exponentialBackoff');
    writeFileSync(target, edited);

    const result = await indexRepo(store, embedder, repo);

    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(fake.inputs.length - embeddedAfterFirst).toBe(1);
    expect(fake.inputs.at(-1)).toContain('exponentialBackoff');
    store.close();
  });

  test('search returns the semantically closest chunk first, ordered by ascending distance', async () => {
    const config = baseConfig();
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(config.indexDbPath, DIM, config.embedModel);
    const embedder = createEmbedder(config, fake.request);

    await indexRepo(store, embedder, fixturesDir);
    const hits = await search(store, embedder, 'event attempts delay retry', 10);

    expect(hits[0]!.symbol).toBe('retryFailedWebhookDelivery');
    expect(hits[0]!.path).toBe('webhooks.ts');
    const distances = hits.map((hit) => hit.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    store.close();
  });

  test('document and query prefixes reach the embedder', async () => {
    const config = baseConfig({ embedDocPrefix: 'search_document: ', embedQueryPrefix: 'search_query: ' });
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(config.indexDbPath, DIM, config.embedModel);
    const embedder = createEmbedder(config, fake.request);

    await indexRepo(store, embedder, fixturesDir);
    expect(fake.inputs.every((text) => text.startsWith('search_document: // '))).toBe(true);

    await search(store, embedder, 'retry', 5);
    expect(fake.inputs.at(-1)).toBe('search_query: retry');
    store.close();
  });
});

describe('startup', () => {
  test('a dimension mismatch fails fast with a clear error', () => {
    const dbPath = join(workspace, 'code.db');
    const built = createStore(dbPath, DIM, 'fake-model');
    built.close();

    expect(() => createStore(dbPath, DIM / 2, 'fake-model')).toThrow(/dimension mismatch/i);
  });
});

describe('cli', () => {
  test('index then search through the CLI binary returns ranked path:line hits', async () => {
    const dim = DIM;
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const body = (await request.json()) as { input: string[]; model: string };
        const data = body.input.map((text, index) => ({
          object: 'embedding',
          index,
          embedding: vectorFor(text, dim),
        }));
        return Response.json({ object: 'list', model: body.model, data, usage: { prompt_tokens: 0, total_tokens: 0 } });
      },
    });

    const env = {
      ...process.env,
      EMBED_BASE_URL: `http://localhost:${server.port}/v1`,
      EMBED_API_KEY: 'no-key',
      EMBED_MODEL: 'fake-model',
      EMBED_DIMENSIONS: String(dim),
      INDEX_DB_PATH: join(workspace, 'cli.db'),
      DEBUG: '1',
    };

    const run = async (args: string[]) => {
      const proc = Bun.spawn(['bun', join(import.meta.dir, '..', 'src', 'cli.ts'), ...args], {
        env,
        cwd: join(import.meta.dir, '..'),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;
      return { stdout, stderr, code };
    };

    const indexed = await run(['index', fixturesDir]);
    expect(indexed.code).toBe(0);
    expect(JSON.parse(indexed.stdout).added).toBe(9);
    expect(indexed.stderr).toContain('[scs] embed request:');
    expect(indexed.stderr).toContain('tokens');

    const searched = await run(['search', 'event attempts delay retry']);
    server.stop(true);

    expect(searched.code).toBe(0);
    const payload = JSON.parse(searched.stdout);
    expect(payload.query).toBe('event attempts delay retry');
    expect(payload.results[0].path).toBe('webhooks.ts');
    expect(payload.results[0].startLine).toBe(1);
    expect(payload.results[0].symbol).toBe('retryFailedWebhookDelivery');
  });
});
