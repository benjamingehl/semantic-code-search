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
| `INDEX_DB_PATH` | Explicit path to the `.db` file (overrides `INDEX_DB_DIR`) | `./code.db` |
| `INDEX_DB_DIR` | Directory holding one `.db` per repo, named from `CLAUDE_PROJECT_DIR` | unset |

The embedding backend is chosen entirely by configuration. Switching from
OpenRouter to a local `llama-server`/Ollama/LM Studio/vLLM is an env change only.

## Use

```bash
bun run index <path>            # build/update the index
bun run search "<query>" [-k N] # search (default k = 20)
```

### Install globally

Run `bun link` once from the repo root to register a global `scs` command, then
use it from any directory:

```bash
bun link                        # registers `scs` on your PATH
scs index <path>                # build/update the index
scs search "<query>" [-k N]     # search (default k = 20)
```

`scs` operates on the directory you run it from (the index defaults to
`./code.db`). Run `bun unlink` to remove the global command.

## MCP server (Claude Code)

Expose `index` and `search` to Claude Code as an MCP server, packaged in Docker so
there's no host-side Bun install and no macOS SQLite caveat (inside the Linux
container `bun:sqlite` loads the `sqlite-vec` extension natively).

The server exposes two tools: `search_code` (natural-language query → ranked
`path:line` hits) and `index_repo` (index/refresh the current project — defaults to
the project root; an optional path must stay within it, since only that directory is
mounted into the container).

### 1. Build the image

```bash
bun run mcp:build               # == docker build -t scs-mcp:local .
```

### 2. Create `~/.scs.env`

```
EMBED_API_KEY=sk-...
EMBED_BASE_URL=https://openrouter.ai/api/v1
EMBED_MODEL=qwen/qwen3-embedding-8b
EMBED_DIMENSIONS=768
```

### 3. Register with Claude Code

The mount is scoped to **only the project Claude is working in**, using the
`CLAUDE_PROJECT_DIR` variable Claude Code injects into the server's environment. A
small `sh -c` wrapper expands it for the volume mount:

```bash
claude mcp add semantic-code-search -- \
  sh -c 'docker run -i --rm \
  --env-file "$HOME/.scs.env" \
  -e CLAUDE_PROJECT_DIR \
  -v scs-index:/data \
  -v "$CLAUDE_PROJECT_DIR":"$CLAUDE_PROJECT_DIR":ro \
  scs-mcp:local'
```

- `-v scs-index:/data` is a named volume that persists indexes across `--rm` runs.
  Each repo gets its own `<repo>-<hash>.db` inside it (the name is derived from
  `CLAUDE_PROJECT_DIR`), so search results never leak across projects.
- `-v "$CLAUDE_PROJECT_DIR":...:ro` mounts **only the current project, read-only, at
  the same path**, so the container sees nothing else on your machine. `index_repo`
  with no arguments indexes that project; `search_code` queries its index.
- `-e CLAUDE_PROJECT_DIR` forwards the path into the container so the server can
  default `index_repo` to it and pick the matching per-repo `.db`.

Use `--scope user` (added before `--`) to register it once for all projects:
`claude mcp add --scope user semantic-code-search -- sh -c '...'`.

Then run `/mcp` in Claude Code to confirm it connects, and ask Claude to "index this
repo" and search it.

### Local development

Run the server directly under Bun (uses your local `INDEX_DB_PATH`, no Docker):

```bash
bun run mcp
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
