import type { Embedder, SearchHit } from './types.ts';
import type { Store } from './store.ts';

export const search = async (store: Store, embedder: Embedder, query: string, k = 20): Promise<SearchHit[]> => {
  const vector = await embedder.embedQuery(query);
  return store.search(vector, k);
};
