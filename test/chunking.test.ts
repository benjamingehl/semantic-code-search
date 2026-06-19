import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkFile } from '../src/chunker/index.ts';

const fixture = (name: string): string => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

const langFixture = (name: string): string => readFileSync(join(import.meta.dir, 'langs', name), 'utf8');

describe('chunkFile', () => {
  test('splits a class into per-method chunks plus a class-header chunk', async () => {
    const chunks = await chunkFile('webhooks.ts', fixture('webhooks.ts'));

    expect(chunks.map((chunk) => chunk.symbol)).toEqual([
      'retryFailedWebhookDelivery',
      'formatCurrency',
      'PaymentProcessor.charge',
      'PaymentProcessor',
    ]);

    const retry = chunks[0]!;
    expect(retry.path).toBe('webhooks.ts');
    expect(retry.language).toBe('typescript');
    expect(retry.startLine).toBe(1);
    expect(retry.code).toContain('retryFailedWebhookDelivery');

    const charge = chunks[2]!;
    expect(charge.code).toContain('charge');
    expect(charge.code).not.toContain('class PaymentProcessor');

    const header = chunks[3]!;
    expect(header.code).toContain('class PaymentProcessor');
    expect(header.code).not.toContain('charge');
  });

  test('splits a Python class into per-method chunks plus a class-header chunk', async () => {
    const chunks = await chunkFile('users.py', fixture('users.py'));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['load_user_profile', 'SessionStore.save', 'SessionStore']);
    expect(chunks.every((chunk) => chunk.language === 'python')).toBe(true);
  });

  test('indexes top-level TypeScript interfaces and enums alongside functions', async () => {
    const chunks = await chunkFile('sample.ts', langFixture('sample.ts'));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(['Account', 'Currency', 'newLedger']);
    expect(chunks.every((chunk) => chunk.language === 'typescript')).toBe(true);
  });

  const languageCases: Array<[string, string, string[]]> = [
    ['sample.go', 'go', ['Ledger', 'NewLedger', 'Deposit']],
    ['sample.rs', 'rust', ['Ledger', 'Currency', 'Account', 'Ledger.deposit', 'Ledger', 'new_ledger']],
    ['sample.java', 'java', ['Ledger.Ledger', 'Ledger.deposit', 'Ledger', 'Account']],
    ['sample.c', 'c', ['Ledger', 'deposit', 'main']],
    ['sample.cpp', 'cpp', ['Ledger', 'Ledger::deposit', 'main']],
    ['sample.cs', 'csharp', ['Ledger.Ledger', 'Ledger.Deposit', 'Ledger', 'IAccount']],
    ['sample.rb', 'ruby', ['Ledger.initialize', 'Ledger.deposit', 'Ledger', 'new_ledger']],
    ['sample.php', 'php', ['Ledger.deposit', 'Ledger', 'newLedger']],
    ['sample.kt', 'kotlin', ['Ledger.deposit', 'Ledger', 'newLedger']],
    ['sample.swift', 'swift', ['Ledger.deposit', 'Ledger', 'newLedger']],
    ['sample.scala', 'scala', ['Ledger.deposit', 'Ledger', 'Payments.newLedger', 'Payments']],
    ['sample.sh', 'bash', ['deposit', 'new_ledger']],
  ];

  test.each(languageCases)('extracts definitions from %s', async (file, language, symbols) => {
    const chunks = await chunkFile(file, langFixture(file));
    expect(chunks.map((chunk) => chunk.symbol)).toEqual(symbols);
    expect(chunks.every((chunk) => chunk.language === language)).toBe(true);
  });

  test('keeps a class field block in its own header chunk, separate from methods', async () => {
    const chunks = await chunkFile('sample.kt', langFixture('sample.kt'));

    const header = chunks.find((chunk) => chunk.symbol === 'Ledger')!;
    expect(header.code).toContain('var balance');
    expect(header.code).not.toContain('fun deposit');

    const method = chunks.find((chunk) => chunk.symbol === 'Ledger.deposit')!;
    expect(method.code).toContain('fun deposit');
    expect(method.code).not.toContain('var balance');
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
