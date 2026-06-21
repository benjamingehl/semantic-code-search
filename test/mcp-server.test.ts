import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { vectorFor } from './fakeEmbedder.ts';

const DIM = 64;

let embedServer: ReturnType<typeof Bun.serve>;
let workspace: string;
let client: Client;
let transport: StdioClientTransport;

const textOf = (result: unknown): string => (result as { content: { text: string }[] }).content[0]!.text;

beforeAll(() => {
  embedServer = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = (await request.json()) as { input: string[]; model: string };
      const data = body.input.map((text, index) => ({ object: 'embedding', index, embedding: vectorFor(text, DIM) }));
      return Response.json({ object: 'list', model: body.model, data, usage: { prompt_tokens: 0, total_tokens: 0 } });
    },
  });
});

afterAll(() => {
  embedServer.stop(true);
});

beforeEach(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'scs-mcp-'));
  writeFileSync(join(workspace, 'sample.ts'), 'export const retryFailedWebhookDelivery = () => 42;\n');
  writeFileSync(
    join(workspace, 'guide.md'),
    '# Deployment\n\nRoll out the service to production with zero downtime.\n',
  );
  transport = new StdioClientTransport({
    command: 'bun',
    args: [join(import.meta.dir, '..', 'mcp', 'server.ts')],
    env: {
      ...process.env,
      EMBED_BASE_URL: `http://localhost:${embedServer.port}/v1`,
      EMBED_API_KEY: 'no-key',
      EMBED_MODEL: 'fake-model',
      EMBED_DIMENSIONS: String(DIM),
      CLAUDE_PROJECT_DIR: workspace,
      INDEX_DB_PATH: join(workspace, 'code.db'),
    },
  });
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
});

afterEach(async () => {
  await client.close();
  rmSync(workspace, { recursive: true, force: true });
});

describe('mcp server', () => {
  test('lists the semantic_search and refresh_index tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['refresh_index', 'semantic_search']);

    const searchTool = tools.find((tool) => tool.name === 'semantic_search')!;
    expect(searchTool.annotations?.readOnlyHint).toBe(false);

    const refreshTool = tools.find((tool) => tool.name === 'refresh_index')!;
    expect(refreshTool.annotations?.readOnlyHint).toBe(false);
    expect(refreshTool.annotations?.idempotentHint).toBe(true);
  });

  test('semantic_search auto-builds the index on first use and finds a chunk', async () => {
    const searched = await client.callTool({ name: 'semantic_search', arguments: { query: 'retry webhook delivery' } });
    expect(searched.isError).toBeFalsy();
    const payload = JSON.parse(textOf(searched));
    expect(typeof payload.lastIndexedAt).toBe('string');
    expect(payload.lastIndexedAt.length).toBeGreaterThan(0);
    const hit = payload.results.find((result: { path: string }) => result.path === 'sample.ts');
    expect(hit.startLine).toBe(1);
    expect(hit.symbol).toBe('retryFailedWebhookDelivery');
    expect(hit.language).toBe('typescript');
    expect(hit.content).toContain('retryFailedWebhookDelivery');
    expect((searched as { structuredContent: unknown }).structuredContent).toEqual(payload);
  });

  test('finds a markdown document section labeled as a document, not code', async () => {
    const searched = await client.callTool({ name: 'semantic_search', arguments: { query: 'deploy to production' } });
    expect(searched.isError).toBeFalsy();
    const payload = JSON.parse(textOf(searched));
    const hit = payload.results.find((result: { path: string }) => result.path === 'guide.md');
    expect(hit.language).toBe('markdown');
    expect(hit.symbol).toBe('Deployment');
    expect(hit.content).toContain('zero downtime');
    expect(hit.code).toBeUndefined();
  });

  test('refresh_index reports added counts and advances on re-run', async () => {
    const first = await client.callTool({ name: 'refresh_index', arguments: {} });
    expect(first.isError).toBeFalsy();
    const firstPayload = JSON.parse(textOf(first));
    expect(firstPayload.added).toBe(2);
    expect(typeof firstPayload.lastIndexedAt).toBe('string');

    const second = await client.callTool({ name: 'refresh_index', arguments: {} });
    expect(second.isError).toBeFalsy();
    const secondPayload = JSON.parse(textOf(second));
    expect(secondPayload.added).toBe(0);
    expect(secondPayload.skipped).toBe(2);
  });

  test('semantic_search reports no results when the project has nothing to index', async () => {
    rmSync(join(workspace, 'sample.ts'));
    rmSync(join(workspace, 'guide.md'));

    const searched = await client.callTool({ name: 'semantic_search', arguments: { query: 'anything' } });
    expect(searched.isError).toBeFalsy();
    const payload = JSON.parse(textOf(searched));
    expect(payload.count).toBe(0);
    expect(payload.results).toEqual([]);
    expect(typeof payload.lastIndexedAt).toBe('string');
  });

  test('semantic_search rejects an empty query', async () => {
    const searched = await client.callTool({ name: 'semantic_search', arguments: { query: '  ' } });
    expect(searched.isError).toBe(true);
    expect(JSON.parse(textOf(searched)).error).toContain('non-empty');
  });

  test('an unknown tool returns an error', async () => {
    const result = await client.callTool({ name: 'nope', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).error).toContain('Unknown tool');
  });
});
