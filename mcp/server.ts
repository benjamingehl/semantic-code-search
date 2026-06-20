import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createEmbedder } from '../src/embedder.ts';
import { indexRepo } from '../src/indexer.ts';
import { search } from '../src/search.ts';
import { errorMessage, withSession } from '../src/session.ts';
import {
  indexOutputSchema,
  indexPayload,
  searchOutputSchema,
  searchPayload,
  type IndexPayload,
  type SearchPayload,
} from '../src/output.ts';

const runSearch = async (query: string, k: number): Promise<SearchPayload> =>
  withSession(async ({ config, store }) => {
    const hits = await search(store, createEmbedder(config), query, k);
    return searchPayload(query, hits);
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

const runIndex = async (path: string): Promise<IndexPayload> =>
  withSession(async ({ config, store }) => {
    const result = await indexRepo(store, createEmbedder(config), path);
    return indexPayload(path, result);
  });

const tools = [
  {
    name: 'search_code',
    description:
      'Semantic code search over the indexed repositories. Returns a JSON object with ranked hits (path, symbol, startLine, endLine, distance, code).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of the code to find.' },
        k: { type: 'number', description: 'Maximum number of results to return (default 20).' },
      },
      required: ['query'],
    },
    outputSchema: searchOutputSchema,
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
    outputSchema: indexOutputSchema,
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
      const payload = await runSearch(query, k);
      return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
    }

    if (name === 'index_repo') {
      const path = resolveWithinProject(String(args.path ?? '').trim());
      const payload = await runIndex(path);
      return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: errorMessage(error) }) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
