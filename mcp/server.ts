import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../src/config.ts';
import { createStore } from '../src/store.ts';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import type { SearchHit } from '../src/types.ts';

const formatHit = (hit: SearchHit): string => {
  const header = `${hit.path}:${hit.startLine}  ${hit.symbol}  (distance ${hit.distance.toFixed(4)})`;
  const body = hit.code
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `${header}\n${body}`;
};

const withStore = async <T>(run: (store: ReturnType<typeof createStore>) => Promise<T>): Promise<T> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    return await run(store);
  } finally {
    store.close();
  }
};

const runSearch = async (query: string, k: number): Promise<string> =>
  withStore(async (store) => {
    const hits = await search(store, createEmbedder(loadConfig()), query, k);
    if (hits.length === 0) return 'No results.';
    return hits.map(formatHit).join('\n\n');
  });

const projectRoot = (): string => resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

const resolveWithinProject = (requested: string): string => {
  const root = projectRoot();
  const target = resolve(root, requested || root);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('index_repo path must stay within the project root.');
  }
  return target;
};

const runIndex = async (path: string): Promise<string> =>
  withStore(async (store) => {
    const result = await indexRepo(store, createEmbedder(loadConfig()), path);
    return `Indexed ${path}: added ${result.added}, skipped ${result.skipped}, removed ${result.removed}`;
  });

const tools = [
  {
    name: 'search_code',
    description: 'Semantic code search over the indexed repositories. Returns ranked path:line hits with code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of the code to find.' },
        k: { type: 'number', description: 'Maximum number of results to return (default 20).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'index_repo',
    description:
      'Index or refresh the current project so its code becomes searchable. Defaults to the project root; an optional path must stay within it (paths outside the project are not accessible).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path within the current project to index (default: the project root).',
        },
      },
    },
  },
];

const server = new Server({ name: 'semantic-code-search', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    if (name === 'search_code') {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('search_code requires a non-empty "query".');
      const k = typeof args.k === 'number' && args.k > 0 ? Math.floor(args.k) : 20;
      return { content: [{ type: 'text', text: await runSearch(query, k) }] };
    }

    if (name === 'index_repo') {
      const path = resolveWithinProject(String(args.path ?? '').trim());
      return { content: [{ type: 'text', text: await runIndex(path) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
