# Semantic Code Search

Local-first semantic code search: index a repo into one sqlite-vec `.db`, query
it in natural language, get ranked `path:line` hits. See the spec and the plan in
`~/.claude/plans/` for full context.

## Stack & conventions

- TypeScript on **Bun**. Use `bun <file>`, `bun test`, `bun install`.
- **bun:sqlite + sqlite-vec** for storage. (The spec named better-sqlite3, but
  its native addon does not load under Bun — issue #4290. On Linux `bun:sqlite`
  loads the sqlite-vec extension fine; the spec's macOS extension caveat does not
  apply here. Revisit if macOS support is needed.)
- **web-tree-sitter + tree-sitter-wasms** for AST chunking.
- **openai** SDK pointed at any OpenAI-compatible `/v1/embeddings` endpoint; the
  backend is chosen by env config, never by code.
- Style: arrow functions, single quotes, 120-col, descriptive names, fail fast,
  self-documenting (no inline comments).

## Testing

`bun test`. Sociable behavior tests through real entry points (`indexRepo`,
`search`, CLI) with real Store/Chunker; the only test double is a fake Embedder
at the network boundary. Assert observable outcomes, not internal calls.
