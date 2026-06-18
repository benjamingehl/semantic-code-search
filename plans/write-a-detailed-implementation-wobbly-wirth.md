# Implementation Plan — Semantic Code Search Tool

## Context

We are building a local-first semantic code search tool from a greenfield state
(`/home/benji/projects/semantic-code-search` is empty except `.claude/`). The
problem it solves: keyword/grep search can't answer intent-based questions like
"where do we retry failed webhook deliveries." This tool indexes a repo by
embedding AST-level code chunks into a single SQLite file (`sqlite-vec`) and
answers natural-language queries by cosine KNN, returning `path:line` hits.

The defining constraint: the embedding backend is **pluggable by configuration,
not code**. Every backend (OpenRouter, llama.cpp, Ollama, LM Studio, vLLM,
OpenAI) speaks the OpenAI-compatible `/v1/embeddings` protocol, so one Embedder
implementation serves all of them; asymmetric query/doc optimization is done via
configurable text prefixes. Intended outcome: a `bun run index <repo>` +
`bun run search "<query>"` CLI today, an MCP server wrapper later.

Stack: TypeScript on Bun, `better-sqlite3` + `sqlite-vec` for storage,
`web-tree-sitter` + `tree-sitter-wasms` for chunking, official `openai` SDK for
embeddings. Style follows `general-coding-style` (arrow functions, single
quotes, descriptive names, fail fast, self-documenting, no inline comments) and
the `pragmatic-testing` approach described in §13 of the spec (sociable tests,
real Store, single fake at the network boundary).

### Resolved open decisions (§15)

| Decision | Resolution | Rationale |
|---|---|---|
| Languages/grammars | **TS, JS, Python** | User choice — smallest surface to wire/test; others add later via a grammar registry. |
| Oversize-chunk fallback | **Recursive split** at AST boundaries (fall back to line windows) | User choice — no data loss; large functions stay fully searchable. |
| Unparseable files | **Whole-file single chunk** | User choice — file stays searchable even when symbols are unknown; run never aborts. Same path as the "no recognized units" case in §9. |
| `vec0` prefilter metadata columns | **Defer** | Brute-force KNN over ≤ tens-of-thousands chunks is fast/exact; filtering can be added without a schema break later. |
| CLI parsing / watch | **Bun's built-in `util.parseArgs`; no watch in v1** | User scoped v1 to index + search only. |
| Reranking | **Out of scope**; integration point noted in Future section | Per spec. |

## Module / file layout (maps to §5 components)

```
semantic-code-search/
  package.json            scripts: index, search, test, eslint, prettier
  tsconfig.json
  eslint.config.js        (prettier config nested inside, per setup-bun skill)
  src/
    config.ts             loadConfig(): reads env (§7), validates, freezes
    types.ts              Embedder, Chunk, SearchHit, Config types (§5)
    embedder.ts           createEmbedder(config) -> Embedder (openai SDK, prefixes, batching)
    chunker/
      index.ts            chunkFile(path, source) -> Chunk[]
      grammars.ts         language registry + tree-sitter-wasms path resolution + Parser cache
      queries.ts          per-language tree-sitter node-type sets (function/method/class)
    store.ts              createStore(dbPath, dim) -> Store (schema, upsert, search, prune)
    indexer.ts            indexRepo(store, embedder, repoPath) -> { added, skipped, removed }
    search.ts             search(store, embedder, query, k) -> SearchHit[]
    hash.ts               sha256(text) -> hex
    walk.ts               walkRepo(path) -> file paths (respect .gitignore, skip binaries)
    cli.ts                arg parsing + index/search subcommands + output formatting
  test/
    fixtures/             tiny multi-language sample repo
    fakeEmbedder.ts       deterministic vectors keyed by text content
    indexer.test.ts
    search.test.ts
    chunker.test.ts
    store.test.ts
    config.test.ts
```

## Component contracts & key decisions

### config.ts
- `loadConfig()` reads the §7 env vars with the specified defaults, coerces
  `EMBED_DIMENSIONS` / `EMBED_BATCH_SIZE` to numbers, and returns a frozen
  `Config`. Prefixes default to `''` (unset → no prefix).
- Fails fast on invalid numeric values.

### types.ts
- Exactly the `Embedder`, `Chunk`, `SearchHit` shapes from §5, plus `Config`.

### embedder.ts — `createEmbedder(config): Embedder`
- Wraps `new OpenAI({ baseURL, apiKey })`. `apiKey` may be the literal `no-key`
  for local servers.
- `embedDocs(texts)`: prepend `EMBED_DOC_PREFIX` to each, split into batches of
  `EMBED_BATCH_SIZE`, call `client.embeddings.create({ model, input, dimensions })`
  per batch, concatenate results preserving order.
- `embedQuery(text)`: prepend `EMBED_QUERY_PREFIX`, single embed call, return the
  vector.
- `dimensions` is passed through; **this is the only network boundary** and the
  only thing faked in tests.

### store.ts — `createStore(dbPath, dim): Store`
- Opens `better-sqlite3`, loads the `sqlite-vec` extension via the package's
  `getLoadablePath()` (`db.loadExtension(...)`).
- Creates schema from §6 (`chunks` + `chunk_vecs vec0(embedding FLOAT[dim] distance_metric=cosine)`), `chunk_vecs.rowid == chunks.id`.
- **Dimension guard (§12):** persist `dim` (and model id) in a small `meta`
  table on first creation; on open, if the stored `dim` ≠ config `dim`, throw a
  clear error at startup. This makes mismatch fail loudly, not at query time.
- API:
  - `getExistingHashes(repo, path): Set<string>` — for incremental skip.
  - `hasHash(content_hash): boolean`.
  - `insertChunks(chunks, vectors)` — transactional; insert into `chunks`
    (ignore on `content_hash` UNIQUE conflict) then matching `chunk_vecs` row by
    `id`.
  - `deleteByIds(ids)` / `pruneFile(repo, path, keepHashes)` — remove chunk rows
    (and their vectors) whose hash a file no longer produces (§10).
  - `search(queryVec, k): SearchHit[]` — KNN against `chunk_vecs`, join back to
    `chunks`, order by ascending distance.
  - `close()`.

### chunker/ — `chunkFile(path, source): Chunk[]`
- `grammars.ts`: maps file extension → language id (`ts`, `js`, `python`) and
  resolves the matching `.wasm` from `tree-sitter-wasms` via
  `require.resolve('tree-sitter-wasms/out/tree-sitter-<lang>.wasm')`; caches an
  initialized `Parser` per language. Initializes `web-tree-sitter` once.
- `queries.ts`: per-language set of node types treated as a unit
  (`function_declaration`, `method_definition`, `class_declaration`,
  `arrow_function` assigned to a const, Python `function_definition` /
  `class_definition`, etc.).
- `chunkFile`:
  1. Unknown extension OR parse error (root node `hasError` / parser unavailable)
     → **whole-file single chunk** (`symbol` = basename, lines 1..N).
  2. Walk the tree, emit one `Chunk` per matched unit with `symbol`, `startLine`,
     `endLine`, `language`, `path`.
  3. File with no matched units (e.g. config/script) → single whole-file chunk.
  4. **Oversize fallback (recursive split):** if a chunk's text exceeds a
     configurable char threshold, recursively split it at child AST boundaries;
     if no usable children, split by fixed line windows. Sub-chunks keep the
     parent symbol with an index suffix.
- **Each chunk's embed text is prefixed with its file path** (§9) so it is
  self-contained. `code` stores the raw snippet; `content_hash` (§10) is the
  SHA-256 of the **path-prefixed text** so a moved file re-embeds.

### indexer.ts — `indexRepo(store, embedder, repoPath)`
1. `walkRepo` to enumerate source files (skip `.git`, `node_modules`, binaries,
   honor `.gitignore` if present).
2. For each file: `chunkFile`, compute `content_hash` per chunk.
3. Determine new chunks (`hash` not already in store) → collect their texts.
4. `pruneFile` to drop stale hashes the file no longer produces.
5. Batch-embed new chunk texts via `embedder.embedDocs`, `insertChunks`
   transactionally.
6. Return `{ added, skipped, removed }` counts for CLI reporting.

### search.ts — `search(store, embedder, query, k = 20)`
- `embedder.embedQuery(query)` → `store.search(vec, k)` → `SearchHit[]` ordered
  by ascending cosine distance.

### cli.ts
- `util.parseArgs`; subcommands:
  - `index <path>` → build/update db, print `added/skipped/removed`.
  - `search <query> [-k N]` → print each hit as `path:startLine  symbol
    (distance)` followed by the snippet.
- Reads config via `loadConfig()`, constructs store + embedder, fails fast with
  readable errors.

## Build sequence (independently testable milestones)

1. **Project bootstrap** — run `setup-bun-based-project` skill: Bun init,
   ESLint + Prettier (single quotes, 120 width, prettier nested in eslint
   config), `tsconfig`, scripts. Add deps (below).
2. **config + types** — env loading with defaults/validation (no dedicated test;
   exercised via the behavior tests below).
3. **Store** — schema, insert, search, prune, dimension guard (real sqlite-vec).
4. **Chunker** — grammar wiring + AST chunking + whole-file fallback + recursive
   split.
5. **Embedder** — openai SDK wrapper, prefixes, batching.
6. **Indexer** — wire chunker + store + embedder; incremental + prune. This is
   the first real entry point — behavior tests 1–4 land here.
7. **Search** — query path end to end. Behavior tests 5–6 land here; test 7
   (dimension mismatch) via the startup path.
8. **CLI** — arg parsing + formatting; one behavior test drives `index` then
   `search` through the CLI.

Tests are written against the **entry points** (`indexRepo`, `search`, CLI) per
the pragmatic-testing list above, not per-module. Each milestone follows `tdd`
(RED → GREEN → REFACTOR) where a failing behavior test exists to drive it; run
`bun test` after every phase.

## Dependencies

Runtime: `better-sqlite3`, `sqlite-vec`, `web-tree-sitter`, `tree-sitter-wasms`,
`openai`.
Dev: `typescript`, `eslint`, `prettier`, `@types/better-sqlite3`, eslint TS
plugins. (Bun provides the test runner and `util.parseArgs`.)

Grammar-asset wiring: resolve `.wasm` paths from the installed `tree-sitter-wasms`
package at runtime via `require.resolve` rather than copying assets, so they work
from `node_modules` without a build step.

## Test plan (pragmatic-testing: sociable, behavior-focused)

This follows the `pragmatic-testing` skill: **test behaviors through their real
entry points, not units.** The real entry points here are `indexRepo` and
`search` (and the CLI on top of them). Each test drives a real behavior with all
real collaborators — the real `Store` on a real sqlite-vec db, the real
`Chunker`, the real `Indexer`/`Search` — and asserts on **observable outcomes**
(returned `SearchHit[]`, reported counts, what comes back out of a query), not on
internal calls or private state.

**The only test double** is `test/fakeEmbedder.ts` at the genuine non-deterministic
boundary (the network). It returns deterministic vectors derived from text
content (e.g. hashed-token bag → fixed-dim vector) so that semantically closer
texts get closer vectors, and it **records the exact strings it was asked to
embed** (the prefix behavior's only observable point is the text crossing this
boundary). No other component is mocked, stubbed, or isolated.

We do **not** write per-module unit files (`store.test.ts`, `config.test.ts`,
`embedder.test.ts`, `chunker.test.ts`). Those behaviors surface through the
two entry points and are asserted there. Trivial glue (config defaulting, hashing,
walking) is exercised transitively and not pinned with dedicated tests.

Test files: `test/index-search.test.ts` (most cases) and, if a focused chunking
assertion reads more clearly directly, a small `test/chunking.test.ts` driving
`chunkFile` as its own real entry point.

Behaviors that must work (the functional requirements — §13):

1. **Indexing yields one chunk per code unit, correctly located.** Index the
   fixture repo, then read the produced chunks back out (via a `Store` query /
   the search path) and assert N functions/methods/classes → N chunks with the
   right `path`, `symbol`, `startLine`, `endLine`, `language`.
2. **Non-code and unparseable files become one whole-file chunk and never abort
   the run.** The fixture repo includes a config/no-unit file and a deliberately
   malformed source file; indexing completes and each yields exactly one
   whole-file chunk. (Covers §13 "unparseable file does not abort".)
3. **Re-indexing unchanged files embeds nothing new.** Index twice; the second
   `indexRepo` returns `added: 0`, and the fake embedder records **zero** new
   doc strings on the second run (observable hash-skip).
4. **Editing a function re-embeds only that chunk and drops the stale one.**
   Modify one function, re-index; `indexRepo` reports exactly one added and one
   removed, the fake embedder was asked to embed only the changed chunk, and a
   query no longer returns the old version.
5. **Search returns the semantically closest chunk first, ordered by ascending
   distance.** Drive a query through `search`; assert the expected chunk is hit
   #1 and distances are non-decreasing.
6. **Document and query prefixes reach the embedder.** With `EMBED_DOC_PREFIX` /
   `EMBED_QUERY_PREFIX` set, index then search; assert the strings recorded by
   the fake embedder begin with the configured prefixes (observed at the real
   boundary, not via a spy on an internal method).
7. **Dimension mismatch fails fast at startup.** Build a db at one `DIM`, then
   open it through the normal startup path with a different configured `DIM`;
   assert a clear error is thrown before any query runs (§12).

Drive at least one case through the **CLI entry point** (`index` then `search`)
to confirm the wiring and output formatting, rather than only the in-process
functions.

## Verification (end to end)

- `bun test` — all §13 behaviors green.
- `bun run index ./test/fixtures` builds `code.db`; a second run prints zero new
  embeddings (acceptance §14).
- `bun run search "retry failed webhook"` against a real local backend
  (`llama-server --embeddings --pooling mean`, `EMBED_BASE_URL=http://host:port/v1`,
  `EMBED_API_KEY=no-key`) returns ranked `path:line` hits.
- Switch `EMBED_BASE_URL`/`EMBED_API_KEY`/`EMBED_MODEL` to OpenRouter and confirm
  the same commands work with no code change (acceptance §14).

## Future (explicitly out of v1 scope)

- **MCP server wrapper:** a thin `src/mcp.ts` that constructs the same
  `store` + `embedder` and exposes `search(query, k)` as an MCP tool returning
  `SearchHit[]`. No change to core modules — it reuses `search.ts` verbatim.
- **Watch mode:** a `watch` subcommand re-running `indexRepo` on filesystem
  change events.
- **Reranking:** integration point is between `store.search` (retrieve top-N) and
  the CLI/MCP return — feed candidates to a cross-encoder/reranker and reorder
  before returning the top-k.
- **`vec0` prefilter metadata** (language/repo columns) for scoped search once
  multi-repo or very large indexes are needed.
