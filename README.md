# semantic-code-search

Local-first semantic code search: index a codebase into one `sqlite-vec` database
and query it in natural language, getting ranked `path:line` hits back.

## Install

```bash
bun install
```

## Configure (environment variables)

| Variable | Purpose | Default |
|---|---|---|
| `EMBED_BASE_URL` | OpenAI-compatible endpoint | `https://openrouter.ai/api/v1` |
| `EMBED_API_KEY` | API key (`no-key` for local servers) | `no-key` |
| `EMBED_MODEL` | Model id/slug | `qwen/qwen3-embedding-8b` |
| `EMBED_DIMENSIONS` | Output dimension (fixed at index creation) | `768` |
| `EMBED_DOC_PREFIX` | Prefix prepended to documents | unset |
| `EMBED_QUERY_PREFIX` | Prefix prepended to queries | unset |
| `EMBED_BATCH_SIZE` | Documents per embed request | `64` |
| `INDEX_DB_PATH` | Path to the `.db` file | `./code.db` |

The embedding backend is chosen entirely by configuration. Switching from
OpenRouter to a local `llama-server`/Ollama/LM Studio/vLLM is an env change only.

## Use

```bash
bun run index <path>            # build/update the index
bun run search "<query>" [-k N] # search (default k = 20)
```

## Ignoring files

Indexing skips a few build/dependency directories by default (`.git`,
`node_modules`, `dist`, …) and honors the repo's `.gitignore`. Add a
`.scsignore` at the repo root (same syntax as `.gitignore`) to exclude more
paths; its patterns are applied on top of `.gitignore`, so a negation such as
`!keep.gen.ts` can re-include a file `.gitignore` excluded.

## Test

```bash
bun test
```
