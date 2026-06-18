import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { createStore } from './store.ts';
import { createEmbedder } from './embedder.ts';
import { indexRepo } from './indexer.ts';
import { search } from './search.ts';
import type { SearchHit } from './types.ts';

const usage = `Usage:
  bun run index <path>
  bun run search "<query>" [-k N]`;

const formatHit = (hit: SearchHit): string => {
  const header = `${hit.path}:${hit.startLine}  ${hit.symbol}  (distance ${hit.distance.toFixed(4)})`;
  const body = hit.code
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `${header}\n${body}\n`;
};

const runIndex = async (path: string): Promise<void> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    const result = await indexRepo(store, createEmbedder(config), path);
    console.log(`Indexed ${path}: added ${result.added}, skipped ${result.skipped}, removed ${result.removed}`);
  } finally {
    store.close();
  }
};

const runSearch = async (query: string, k: number): Promise<void> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    const hits = await search(store, createEmbedder(config), query, k);
    if (hits.length === 0) {
      console.log('No results.');
      return;
    }
    console.log(hits.map(formatHit).join('\n'));
  } finally {
    store.close();
  }
};

const main = async (): Promise<void> => {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'index') {
    const path = rest[0];
    if (!path) throw new Error(usage);
    await runIndex(path);
    return;
  }

  if (command === 'search') {
    const { positionals, values } = parseArgs({
      args: rest,
      options: { k: { type: 'string', short: 'k' } },
      allowPositionals: true,
    });
    const query = positionals.join(' ').trim();
    if (!query) throw new Error(usage);
    await runSearch(query, values.k ? Number(values.k) : 20);
    return;
  }

  throw new Error(usage);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
