import OpenAI from 'openai';
import type { Config, Embedder } from './types.ts';
import { debugLog } from './debug.ts';

export type EmbedRequest = (inputs: string[]) => Promise<number[][]>;

export const openAiEmbedRequest = (config: Config): EmbedRequest => {
  const client = new OpenAI({ baseURL: config.embedBaseUrl, apiKey: config.embedApiKey });
  return async (inputs) => {
    const response = await client.embeddings.create({
      model: config.embedModel,
      input: inputs,
      dimensions: config.embedDimensions,
      encoding_format: 'float',
    });
    debugLog('embed request:', inputs.length, 'inputs,', response.usage?.total_tokens ?? 0, 'tokens');
    return response.data.map((item) => item.embedding as number[]);
  };
};

export const createEmbedder = (config: Config, embedRequest: EmbedRequest = openAiEmbedRequest(config)): Embedder => ({
  embedDocs: async (texts) => {
    const prefixed = texts.map((text) => config.embedDocPrefix + text);
    const vectors: number[][] = [];
    for (let start = 0; start < prefixed.length; start += config.embedBatchSize) {
      vectors.push(...(await embedRequest(prefixed.slice(start, start + config.embedBatchSize))));
    }
    return vectors;
  },
  embedQuery: async (text) => {
    const [vector] = await embedRequest([config.embedQueryPrefix + text]);
    return vector!;
  },
});
