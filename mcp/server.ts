import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import { errorMessage, withSession } from '../src/session.ts';
import {
  refreshOutputSchema,
  refreshPayload,
  searchOutputSchema,
  searchPayload,
  type RefreshPayload,
  type SearchPayload,
} from '../src/output.ts';

const projectRoot = (): string => resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

const runSearch = async (query: string, k: number): Promise<SearchPayload> =>
  withSession(async ({ config, store }) => {
    const embedder = createEmbedder(config);
    if (store.getLastIndexedAt() === null) await indexRepo(store, embedder, projectRoot());
    const hits = await search(store, embedder, query, k);
    return searchPayload(query, hits, store.getLastIndexedAt());
  });

const runRefresh = async (): Promise<RefreshPayload> =>
  withSession(async ({ config, store }) => {
    const result = await indexRepo(store, createEmbedder(config), projectRoot());
    return refreshPayload(result, store.getLastIndexedAt()!);
  });

const tools = [
  {
    name: 'semantic_search',
    description:
      'Semantic search over the current working directory, including code and docs (.md, .pdf). Matches by meaning, not exact text (e.g. "where do we validate auth tokens"). Indexes automatically on first use; no separate step needed. Returns ranked hits (path, symbol, startLine, endLine, distance, language, content) plus lastIndexedAt (ISO timestamp of the last index pass) so you can decide whether to refresh_index after recent edits.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of the code or documentation to find.' },
        k: { type: 'number', minimum: 1, description: 'Maximum number of results to return (default 20).' },
      },
      required: ['query'],
    },
    outputSchema: searchOutputSchema,
    annotations: { title: 'Semantic search', readOnlyHint: false, openWorldHint: true },
  },
  {
    name: 'refresh_index',
    description:
      "Re-index the current working directory (code and docs: .md, .pdf) so recent edits become searchable. Incremental and safe to re-run: skips unchanged files, prunes deleted code. Call when a semantic_search result's lastIndexedAt predates your changes. Returns added/skipped/removed counts and the new lastIndexedAt.",
    inputSchema: { type: 'object', properties: {} },
    outputSchema: refreshOutputSchema,
    annotations: {
      title: 'Refresh index',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

const server = new Server(
  { name: 'semantic-code-search', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions:
      'Local semantic index over the current working directory, including code and docs (.md, .pdf). Prefer semantic_search for natural-language or conceptual queries (e.g. "where is rate limiting implemented") where the exact symbol or string is unknown; it indexes automatically on first use and reports lastIndexedAt. Call refresh_index when that timestamp predates recent edits you want reflected.',
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    if (name === 'semantic_search') {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('semantic_search requires a non-empty "query".');
      const k = typeof args.k === 'number' && args.k > 0 ? Math.floor(args.k) : 20;
      const payload = await runSearch(query, k);
      return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
    }

    if (name === 'refresh_index') {
      const payload = await runRefresh();
      return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: errorMessage(error) }) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
