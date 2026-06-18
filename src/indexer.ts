import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Embedder } from './types.ts';
import type { Store, StoredChunk } from './store.ts';
import { chunkFile, embedTextFor } from './chunker/index.ts';
import { sha256 } from './hash.ts';
import { isProbablyBinary, walkRepo } from './walk.ts';
import { debugLog } from './debug.ts';

export type IndexResult = { added: number; skipped: number; removed: number };

export const indexRepo = async (store: Store, embedder: Embedder, repoPath: string): Promise<IndexResult> => {
  const repo = resolve(repoPath);
  const files = walkRepo(repo);

  const pendingChunks: StoredChunk[] = [];
  const pendingTexts: string[] = [];
  const pendingHashes = new Set<string>();
  let skipped = 0;
  let removed = 0;

  for (const file of files) {
    const content = readFileSync(file);
    if (isProbablyBinary(content)) continue;

    const path = relative(repo, file);
    debugLog('indexed', path);
    const chunks = await chunkFile(path, content.toString('utf8'));
    const keepHashes = new Set<string>();

    for (const chunk of chunks) {
      const text = embedTextFor(chunk);
      const contentHash = sha256(text);
      keepHashes.add(contentHash);

      if (store.hasHash(contentHash) || pendingHashes.has(contentHash)) {
        skipped += 1;
        continue;
      }
      pendingHashes.add(contentHash);
      pendingChunks.push({ ...chunk, repo, contentHash });
      pendingTexts.push(text);
    }

    removed += store.pruneFile(repo, path, keepHashes);
  }

  if (pendingChunks.length > 0) {
    const vectors = await embedder.embedDocs(pendingTexts);
    store.insertChunks(pendingChunks, vectors);
  }

  return { added: pendingChunks.length, skipped, removed };
};
