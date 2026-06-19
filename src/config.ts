import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import type { Config } from './types.ts';

const readPositiveInt = (name: string, raw: string, fallback: number): number => {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
};

const perRepoDbName = (projectDir: string): string => {
  const resolved = resolve(projectDir);
  const hash = createHash('md5').update(resolved).digest('hex').slice(0, 8);
  const slug =
    basename(resolved)
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'repo';
  return `${slug}-${hash}.db`;
};

const resolveDbPath = (env: NodeJS.ProcessEnv): string => {
  if (env.INDEX_DB_PATH) return env.INDEX_DB_PATH;
  const dir = env.INDEX_DB_DIR;
  if (dir) return `${dir}/${env.CLAUDE_PROJECT_DIR ? perRepoDbName(env.CLAUDE_PROJECT_DIR) : 'code.db'}`;
  return './code.db';
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const config: Config = {
    embedBaseUrl: env.EMBED_BASE_URL || 'https://openrouter.ai/api/v1',
    embedApiKey: env.EMBED_API_KEY || 'no-key',
    embedModel: env.EMBED_MODEL || 'qwen/qwen3-embedding-8b',
    embedDimensions: readPositiveInt('EMBED_DIMENSIONS', env.EMBED_DIMENSIONS ?? '', 768),
    embedDocPrefix: env.EMBED_DOC_PREFIX ?? '',
    embedQueryPrefix: env.EMBED_QUERY_PREFIX ?? '',
    embedBatchSize: readPositiveInt('EMBED_BATCH_SIZE', env.EMBED_BATCH_SIZE ?? '', 64),
    embedTokenBudget: readPositiveInt('EMBED_TOKEN_BUDGET', env.EMBED_TOKEN_BUDGET ?? '', 5_000_000),
    indexDbPath: resolveDbPath(env),
  };
  return Object.freeze(config);
};
