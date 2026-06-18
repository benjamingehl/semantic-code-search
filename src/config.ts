import type { Config } from './types.ts';

const readPositiveInt = (name: string, raw: string, fallback: number): number => {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
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
    indexDbPath: env.INDEX_DB_PATH || './code.db',
  };
  return Object.freeze(config);
};
