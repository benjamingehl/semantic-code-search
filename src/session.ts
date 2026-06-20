import type { Config } from './types.ts';
import type { Store } from './store.ts';
import { loadConfig } from './config.ts';
import { createStore } from './store.ts';

export type Session = { config: Config; store: Store };

export const withSession = async <T>(run: (session: Session) => Promise<T>): Promise<T> => {
  const config = loadConfig();
  const store = createStore(config.indexDbPath, config.embedDimensions, config.embedModel);
  try {
    return await run({ config, store });
  } finally {
    store.close();
  }
};

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
