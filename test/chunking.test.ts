import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkFile } from '../src/chunker/index.ts';

const fixture = (name: string): string => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

const langFixture = (name: string): string => readFileSync(join(import.meta.dir, 'langs', name), 'utf8');

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

  test('indexes top-level TypeScript interfaces and enums alongside functions', async () => {
    const chunks = await chunkFile('sample.ts', langFixture('sample.ts'));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['Account', 'Currency', 'newLedger']);
    expect(chunks.every((chunk) => chunk.language === 'typescript')).toBe(true);
  });

  const languageCases: Array<[string, string, string[]]> = [
    ['sample.go', 'go', ['Ledger', 'NewLedger', 'Deposit']],
    ['sample.rs', 'rust', ['Ledger', 'Currency', 'Account', 'Ledger', 'new_ledger']],
    ['sample.java', 'java', ['Ledger', 'Account']],
    ['sample.c', 'c', ['Ledger', 'deposit', 'main']],
    ['sample.cpp', 'cpp', ['Ledger', 'Ledger::deposit', 'main']],
    ['sample.cs', 'csharp', ['Ledger', 'IAccount']],
    ['sample.rb', 'ruby', ['Payments', 'new_ledger']],
    ['sample.php', 'php', ['Ledger', 'newLedger']],
    ['sample.kt', 'kotlin', ['Ledger', 'newLedger']],
    ['sample.swift', 'swift', ['Ledger', 'newLedger']],
    ['sample.scala', 'scala', ['Ledger', 'Payments']],
    ['sample.sh', 'bash', ['deposit', 'new_ledger']],
  ];

  test.each(languageCases)('extracts definitions from %s', async (file, language, symbols) => {
    const chunks = await chunkFile(file, langFixture(file));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(symbols);
    expect(chunks.every((chunk) => chunk.language === language)).toBe(true);
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
