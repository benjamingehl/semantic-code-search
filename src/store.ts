import { Database } from 'bun:sqlite';
import * as sqliteVec from 'sqlite-vec';
import type { Chunk, SearchHit } from './types.ts';

export type StoredChunk = Chunk & { repo: string; contentHash: string };

const defaultSqlitePath = '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib';

if (process.platform === 'darwin') {
  Database.setCustomSQLite(process.env.SQLITE_LIB_PATH ?? defaultSqlitePath);
}

export type Store = {
  hasHash: (contentHash: string) => boolean;
  insertChunks: (chunks: StoredChunk[], vectors: number[][]) => void;
  pruneFile: (repo: string, path: string, keepHashes: Set<string>) => number;
  search: (queryVector: number[], k: number) => SearchHit[];
  getLastIndexedAt: () => string | null;
  setLastIndexedAt: (iso: string) => void;
  close: () => void;
};

const toBlob = (vector: number[]): Uint8Array => new Uint8Array(new Float32Array(vector).buffer);

const assertDimension = (db: Database, dbPath: string, dim: number, model: string): void => {
  const stored = db.query(`SELECT value FROM meta WHERE key = 'dimensions'`).get() as { value: string } | null;
  if (stored === null) {
    const setMeta = db.query(`INSERT INTO meta(key, value) VALUES (?, ?)`);
    setMeta.run('dimensions', String(dim));
    setMeta.run('model', model);
    return;
  }
  if (Number(stored.value) !== dim) {
    throw new Error(
      `Index dimension mismatch: database "${dbPath}" was built with EMBED_DIMENSIONS=${stored.value}, ` +
        `but the current configuration uses ${dim}. Re-index or set EMBED_DIMENSIONS=${stored.value}.`,
    );
  }
};

export const createStore = (dbPath: string, dim: number, model: string): Store => {
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.loadExtension(sqliteVec.getLoadablePath());

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS chunks(
      id INTEGER PRIMARY KEY,
      repo TEXT, path TEXT, symbol TEXT,
      start_line INTEGER, end_line INTEGER, language TEXT,
      code TEXT, content_hash TEXT UNIQUE);
    CREATE INDEX IF NOT EXISTS chunks_repo_path ON chunks(repo, path);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vecs USING vec0(
      embedding FLOAT[${dim}] distance_metric=cosine);
  `);

  assertDimension(db, dbPath, dim, model);

  const selectHash = db.query(`SELECT 1 AS one FROM chunks WHERE content_hash = ?`);
  const insertChunkRow = db.query(`
    INSERT INTO chunks(repo, path, symbol, start_line, end_line, language, code, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertVecRow = db.query(`INSERT INTO chunk_vecs(rowid, embedding) VALUES (?, ?)`);
  const selectIdsAndHashes = db.query(`SELECT id, content_hash FROM chunks WHERE repo = ? AND path = ?`);
  const deleteChunkById = db.query(`DELETE FROM chunks WHERE id = ?`);
  const deleteVecById = db.query(`DELETE FROM chunk_vecs WHERE rowid = ?`);
  const knn = db.query(`
    SELECT c.path AS path, c.symbol AS symbol, c.start_line AS startLine, c.end_line AS endLine,
           c.language AS language, c.code AS content, v.distance AS distance
    FROM chunk_vecs v
    JOIN chunks c ON c.id = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance`);
  const selectLastIndexedAt = db.query(`SELECT value FROM meta WHERE key = 'lastIndexedAt'`);
  const upsertLastIndexedAt = db.query(
    `INSERT INTO meta(key, value) VALUES ('lastIndexedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  const insertChunks = db.transaction((chunks: StoredChunk[], vectors: number[][]): void => {
    chunks.forEach((chunk, i) => {
      const info = insertChunkRow.run(
        chunk.repo,
        chunk.path,
        chunk.symbol,
        chunk.startLine,
        chunk.endLine,
        chunk.language,
        chunk.code,
        chunk.contentHash,
      );
      insertVecRow.run(Number(info.lastInsertRowid), toBlob(vectors[i]!));
    });
  });

  const pruneFile = db.transaction((repo: string, path: string, keepHashes: Set<string>): number => {
    const rows = selectIdsAndHashes.all(repo, path) as { id: number; content_hash: string }[];
    let removed = 0;
    for (const row of rows) {
      if (!keepHashes.has(row.content_hash)) {
        deleteVecById.run(row.id);
        deleteChunkById.run(row.id);
        removed += 1;
      }
    }
    return removed;
  });

  return {
    hasHash: (contentHash) => selectHash.get(contentHash) !== null,
    insertChunks: (chunks, vectors) => insertChunks(chunks, vectors),
    pruneFile: (repo, path, keepHashes) => pruneFile(repo, path, keepHashes),
    search: (queryVector, k) => knn.all(toBlob(queryVector), k) as SearchHit[],
    getLastIndexedAt: () => (selectLastIndexedAt.get() as { value: string } | null)?.value ?? null,
    setLastIndexedAt: (iso) => upsertLastIndexedAt.run(iso),
    close: () => db.close(),
  };
};
