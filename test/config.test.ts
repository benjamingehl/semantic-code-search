import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config.ts';

describe('indexDbPath resolution', () => {
  test('explicit INDEX_DB_PATH wins over INDEX_DB_DIR and CLAUDE_PROJECT_DIR', () => {
    const config = loadConfig({
      INDEX_DB_PATH: '/custom/place.db',
      INDEX_DB_DIR: '/data',
      CLAUDE_PROJECT_DIR: '/home/user/myproject',
    });
    expect(config.indexDbPath).toBe('/custom/place.db');
  });

  test('derives a readable per-repo name from CLAUDE_PROJECT_DIR', () => {
    const config = loadConfig({ INDEX_DB_DIR: '/data', CLAUDE_PROJECT_DIR: '/home/user/myproject' });
    expect(config.indexDbPath).toMatch(/^\/data\/myproject-[0-9a-f]{8}\.db$/);
  });

  test('the derived name is stable across calls', () => {
    const env = { INDEX_DB_DIR: '/data', CLAUDE_PROJECT_DIR: '/home/user/myproject' };
    expect(loadConfig(env).indexDbPath).toBe(loadConfig(env).indexDbPath);
  });

  test('different projects get different db files', () => {
    const a = loadConfig({ INDEX_DB_DIR: '/data', CLAUDE_PROJECT_DIR: '/home/user/alpha' });
    const b = loadConfig({ INDEX_DB_DIR: '/data', CLAUDE_PROJECT_DIR: '/home/user/beta' });
    expect(a.indexDbPath).not.toBe(b.indexDbPath);
  });

  test('INDEX_DB_DIR without CLAUDE_PROJECT_DIR falls back to code.db', () => {
    const config = loadConfig({ INDEX_DB_DIR: '/data' });
    expect(config.indexDbPath).toBe('/data/code.db');
  });

  test('neither set keeps the ./code.db default', () => {
    const config = loadConfig({});
    expect(config.indexDbPath).toBe('./code.db');
  });
});
