import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkFile } from '../src/chunker/index.ts';

const fixture = (name: string): string => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

describe('chunkFile', () => {
  test('emits one chunk per function, arrow const, and class with correct symbol and lines', async () => {
    const chunks = await chunkFile('webhooks.ts', fixture('webhooks.ts'));

    expect(chunks.map((chunk) => chunk.symbol)).toEqual([
      'retryFailedWebhookDelivery',
      'formatCurrency',
      'PaymentProcessor',
    ]);

    const retry = chunks[0]!;
    expect(retry.path).toBe('webhooks.ts');
    expect(retry.language).toBe('typescript');
    expect(retry.startLine).toBe(1);
    expect(retry.code).toContain('retryFailedWebhookDelivery');

    const paymentProcessor = chunks[2]!;
    expect(paymentProcessor.code).toContain('charge');
  });

  test('emits one chunk per Python def and class', async () => {
    const chunks = await chunkFile('users.py', fixture('users.py'));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['load_user_profile', 'SessionStore']);
    expect(chunks.every((chunk) => chunk.language === 'python')).toBe(true);
  });

  test('a file with no recognized units becomes a single whole-file chunk', async () => {
    const chunks = await chunkFile('settings.json', fixture('settings.json'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.symbol).toBe('settings.json');
  });

  test('an unparseable file becomes a single whole-file chunk and does not throw', async () => {
    const chunks = await chunkFile('broken.ts', fixture('broken.ts'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.symbol).toBe('broken.ts');
  });
});
