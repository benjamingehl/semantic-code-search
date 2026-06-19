#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { createStore } from './store.ts';
import { createEmbedder } from './embedder.ts';
import { indexRepo } from './indexer.ts';
import { search } from './search.ts';
import { indexPayload, searchPayload } from './output.ts';

const usage = `Usage:
  scs index <path>
  scs search "<query>" [-k N]`;

const runIndex = async (path: string): Promise<void> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    const result = await indexRepo(store, createEmbedder(config), path);
    console.log(JSON.stringify(indexPayload(path, result), null, 2));
  } finally {
    store.close();
  }
};

const runSearch = async (query: string, k: number): Promise<void> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    const hits = await search(store, createEmbedder(config), query, k);
    console.log(JSON.stringify(searchPayload(query, hits), null, 2));
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
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
});
