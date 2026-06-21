#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { createEmbedder } from './embedder.ts';
import { indexRepo } from './indexer.ts';
import { search } from './search.ts';
import { indexPayload, searchPayload } from './output.ts';
import { errorMessage, withSession } from './session.ts';

const usage = `Usage:
  scs index <path>
  scs search "<query>" [-k N]`;

const runIndex = async (path: string): Promise<void> =>
  withSession(async ({ config, store }) => {
    const result = await indexRepo(store, createEmbedder(config), path);
    console.log(JSON.stringify(indexPayload(path, result), null, 2));
  });

const runSearch = async (query: string, k: number): Promise<void> =>
  withSession(async ({ config, store }) => {
    const hits = await search(store, createEmbedder(config), query, k);
    console.log(JSON.stringify(searchPayload(query, hits, store.getLastIndexedAt()), null, 2));
  });

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
  console.error(JSON.stringify({ error: errorMessage(error) }));
  process.exit(1);
});
