import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '../src/types.ts';
import { chunkDocText, chunkMarkdown, chunkPdf } from '../src/chunker/documents.ts';
import { chunkContent } from '../src/chunker/index.ts';
import { createStore } from '../src/store.ts';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import { createFakeEmbedRequest } from './fakeEmbedder.ts';

const docsDir = join(import.meta.dir, 'doc-fixtures');
const fixture = (name: string): string => readFileSync(join(docsDir, name), 'utf8');

describe('chunkMarkdown', () => {
  test('splits a markdown file into a preamble plus one chunk per heading', () => {
    const chunks = chunkMarkdown('guide.md', fixture('guide.md'));

    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['guide.md', 'Installation', 'Configuration', 'Usage']);
    expect(chunks.every((chunk) => chunk.language === 'markdown')).toBe(true);
    expect(chunks.every((chunk) => chunk.path === 'guide.md')).toBe(true);

    const installation = chunks[1]!;
    expect(installation.code).toContain('# Installation');
    expect(installation.code).not.toContain('## Configuration');
    expect(installation.startLine).toBeLessThan(installation.endLine);
  });
});

describe('chunkContent routing', () => {
  test('routes markdown buffers to the markdown chunker', async () => {
    const chunks = await chunkContent('guide.md', Buffer.from(fixture('guide.md')));

    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['guide.md', 'Installation', 'Configuration', 'Usage']);
    expect(chunks.every((chunk) => chunk.language === 'markdown')).toBe(true);
  });

  test('skips binary content', async () => {
    const chunks = await chunkContent('logo.png', Buffer.from([0x89, 0x50, 0x00, 0x4e]));

    expect(chunks).toEqual([]);
  });
});

describe('chunkDocText', () => {
  test('drops near-empty paragraphs and merges small ones', () => {
    const text = ['Tiny.', '   ', 'Another short line.', '\f', 'A third fragment of prose.'].join('\n\n');
    const chunks = chunkDocText('notes.pdf', 'pdf', text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.language).toBe('pdf');
    expect(chunks[0]!.symbol).toBe('notes.pdf#0');
    expect(chunks[0]!.code).toContain('Tiny.');
    expect(chunks[0]!.code).toContain('third fragment');
    expect(chunks[0]!.code).not.toContain('\f');
  });

  test('splits a single oversized paragraph (no blank lines) into bounded chunks', () => {
    const oneLine = 'word '.repeat(8000).trim();
    expect(oneLine.length).toBeGreaterThan(38000);
    const chunks = chunkDocText('report.pdf', 'pdf', oneLine);

    expect(chunks.length).toBeGreaterThan(15);
    expect(chunks.every((chunk) => chunk.code.length <= 2000)).toBe(true);
  });

  test('merges small paragraphs up to the target and numbers chunks in order', () => {
    const paragraph = 'word '.repeat(60).trim();
    const text = Array.from({ length: 20 }, () => paragraph).join('\n\n');
    const chunks = chunkDocText('big.pdf', 'pdf', text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.code.length <= 2000)).toBe(true);
    expect(chunks.some((chunk) => chunk.code.includes('\n\nword'))).toBe(true);
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(chunks.map((_, i) => `big.pdf#${i}`));
  });
});

describe('chunkPdf', () => {
  test('extracts text from a real PDF into chunks', async () => {
    const buffer = readFileSync(join(docsDir, 'sample.pdf'));
    const chunks = await chunkPdf('sample.pdf', buffer);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.language === 'pdf')).toBe(true);
    expect(chunks.map((chunk) => chunk.code).join('\n')).toContain('Semantic search indexes documents');
  });
});

describe('indexRepo over docs', () => {
  const DIM = 64;
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'scs-docs-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const config = (): Config => ({
    embedBaseUrl: 'http://fake/v1',
    embedApiKey: 'no-key',
    embedModel: 'fake-model',
    embedDimensions: DIM,
    embedDocPrefix: '',
    embedQueryPrefix: '',
    embedBatchSize: 4,
    embedTokenBudget: 5_000_000,
    indexDbPath: join(workspace, 'docs.db'),
  });

  test('indexes markdown headings and PDF text, both searchable', async () => {
    const cfg = config();
    const fake = createFakeEmbedRequest(DIM);
    const store = createStore(cfg.indexDbPath, DIM, cfg.embedModel);
    const embedder = createEmbedder(cfg, fake.request);

    const result = await indexRepo(store, embedder, docsDir);

    expect(result.added).toBe(5);

    const mdHit = await search(store, embedder, 'configure environment variables for embedding backend', 5);
    expect(mdHit[0]!.path).toBe('guide.md');
    expect(mdHit[0]!.symbol).toBe('Configuration');

    const pdfHit = await search(store, embedder, 'semantic search indexes documents', 5);
    expect(pdfHit[0]!.path).toBe('sample.pdf');

    store.close();
  });
});
