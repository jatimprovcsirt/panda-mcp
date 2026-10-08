# PANDA MCP

An MCP server that gives AI coding assistants accurate, version-matched knowledge of **PANDA** — the field-level encryption SDK for Indonesian government applications — plus a validator for PANDA usage in an existing codebase.

PANDA is new and niche. Large language models have never seen it, so when a developer asks an assistant to "encrypt the NIK column using PANDA", the assistant will confidently invent an API that does not exist. This server exists to stop that: it gives the assistant the real documentation, and checks the code it produces.

---

## What this server can see

> **This server reads files under the project root you configure. It writes only after you approve. It makes no network requests. It never holds, reads, requests, or has access to an encryption key. It performs no cryptographic operation.**

Every clause is verifiable by reading the source, and `docs/security/VERIFYING.md` explains how to check each one. The repository is public specifically so that this is possible — asking you to run a closed-source tool over your codebase while assuring you it is safe would be the wrong way round.

---

## Why it cannot encrypt anything

This is the first question everyone asks, so it is answered here rather than buried.

**The leak is in the argument, not the return value.**

- `decrypt(envelope)` returns `32************01`. PANDA masks by default, so this is safe by design.
- `encrypt("3201012501990001")` puts the NIK into the model's context **as a tool argument** — regardless of what comes back.

That asymmetry is why the safe design is not "crypto operations, but with a warning". A warning cannot fix an argument-side leak, and it is a policy rather than a control. A model's context window is a system that does not need your citizens' personal data, so this server is not a path into it.

There is no `encrypt`, `decrypt`, `mask`, or `blind_index` tool, under any configuration. This is a design invariant, not a roadmap gap.

### What to use instead

| You want to | Use |
|---|---|
| Encrypt/decrypt at runtime in your application | The PANDA SDK — [PHP](https://github.com/jatimprovcsirt/panda-php), [Node.js](https://github.com/jatimprovcsirt/panda-node), [Go](https://github.com/jatimprovcsirt/panda-go), [Python](https://github.com/jatimprovcsirt/panda-py) |
| Run a one-off operation from a terminal | The PANDA CLI |
| Call PANDA from a language with no SDK | `panda-docker` — the REST/gRPC service |
| **Write correct PANDA code** | **This server** |

---

## Install

```jsonc
// Claude Code / Claude Desktop / Cursor — mcp.json or equivalent
{
  "mcpServers": {
    "panda": {
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp"]
    }
  }
}
```

Documentation-only mode, which reads no local files at all:

```jsonc
{
  "mcpServers": {
    "panda": {
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp", "--docs-only"]
    }
  }
}
```

Air-gapped installs are supported — see `docs/installation.md`.

---

## Tools

### Documentation

| Tool | Purpose |
|---|---|
| `search_docs` | Search bundled documentation, returns cited excerpts |
| `get_api_reference` | Look up how an operation is called in a specific language |
| `get_setup_guide` | Setup steps for a chosen key provider |
| `compare_key_providers` | Local vs Vault vs Infisical |
| `get_envelope_spec` | The canonical v1 wire format |
| `get_server_info` | Version, bundled content, active tools |

Every response carries a citation (`repo/path@commit`), so a wrong answer is traceable to a documentation bug rather than being invisible.

### Validation (Tier 2)

| Tool | Purpose |
|---|---|
| `validate_implementation` | Static analysis — read-only, never modifies files |
| `explain_envelope` | Envelope metadata and structural validity. Does not decrypt; the server has no key. |
| `scaffold_integration` | Generate an integration, writing only after you approve |

Tier 2 tools are **not registered** under `--docs-only`. This is not cosmetic: a model cannot call a tool that was never registered, so the flag is a real reduction in what the server can reach.

---

## Commands

```bash
panda-mcp                 # full tool set
panda-mcp --docs-only     # documentation tools only; reads no local files
panda-mcp --help
panda-mcp --version
```

---

## For security reviewers

The claims above are meant to be checked, not believed.

```bash
npm run check:no-network   # fails if any network API, HTTP client, or network transport appears
npm run check:content      # fails if the bundled documentation is stale
npm run check:version      # fails if the reported version drifts from package.json
```

`check:no-network` is wired into CI. It greps the source for `fetch`, `http.request`, sockets, WebSocket, and known HTTP clients, and fails the build if any appear — alongside a check that no HTTP or SSE transport is imported. The stdio transport is the only one present.

`docs/security/VERIFYING.md` walks through confirming each clause independently, including running the server with network access blocked.

---

## Development

```bash
npm install
npm run build:content      # bundle documentation from the sibling PANDA repositories
npm run build
npm test
npm run typecheck
```

`PANDA_SOURCE_ROOT` tells the content generator where the PANDA repositories live. It defaults to the parent directory of this repo.

The content bundle is **generated, not hand-written**. Hand-copied documentation is how a project ends up with two sources of truth and no way to tell which is current — the generator plus `check:content` exists to make that impossible.

---

## Licence

MIT
