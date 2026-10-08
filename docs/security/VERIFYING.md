# Verifying this server's claims

The README makes five claims. This document explains how to check each one yourself, rather than taking them on trust.

> This server reads files under the project root you configure. It writes only after you approve. It makes no network requests. It never holds, reads, requests, or has access to an encryption key. It performs no cryptographic operation.

If any claim below does not hold for the version you have, that is a security bug. Please report it — see [`SECURITY.md`](./SECURITY.md).

---

## 1. "It makes no network requests"

**Automated check.**

```bash
npm run check:no-network
```

This fails the build if any of the following appear anywhere in `src/`:

- `fetch(`, `http.request(`, `https.request(`, `http.get(` — direct HTTP
- `net.connect(`, `dgram.createSocket(`, `new WebSocket(` — raw sockets
- `XMLHttpRequest`
- an import of `axios`, `node-fetch`, `got`, `superagent`, or `undici`
- an import of any MCP **network** transport (`streamableHttp`, `sse`)

It is wired into CI, so a change that introduces networking cannot be merged.

**The stdio-only property.** The server connects one transport, `StdioServerTransport`, in `src/index.ts`. Verify by grepping:

```bash
grep -rn "Transport" src/index.ts
```

Exactly one transport should appear, and it should be the stdio one. There is no listening socket anywhere in this codebase — that is a structural property, not a configuration setting.

**Empirical check.** Run it with networking blocked and confirm it still works:

```bash
# Linux
unshare -rn node dist/index.js --docs-only

# macOS — use a firewall rule, or Little Snitch in deny-all mode
```

Then exercise a tool. Full functionality with no egress is the strongest form of this proof.

---

## 2. "It never holds, reads, requests, or has access to an encryption key"

**Grep for key access.**

```bash
grep -rniE "PANDA_KEY|decrypt|unmask|privateKey|createDecipher" src/
```

Expected result: matches only in `src/content/generated.ts` (bundled documentation *describing* those names) and in prose. No key-reading code path, no cipher construction, no `crypto` module use beyond nothing at all.

**Check the dependency tree.**

```bash
npm ls --omit=dev
```

You should see `@modelcontextprotocol/sdk` and `zod`, and nothing else. Neither provides encryption or key access.

**How keys actually reach the server: they don't.** There is no environment variable, no config file, and no argument that supplies key material. This is verifiable by reading `src/cli.ts` — the complete flag set is `--docs-only`, `--project-root`, `--include-env`, `--version`, `--help`. None of them is a key.

---

## 3. "It performs no cryptographic operation"

**Check the tool surface.** List every tool the server can register:

```bash
grep -rn "registerTool(" src/tools/
```

Each name should be one of: `search_docs`, `get_api_reference`, `get_setup_guide`, `compare_key_providers`, `get_envelope_spec`, `get_server_info`, `validate_implementation`, `explain_envelope`, `scaffold_integration`. None performs encryption or decryption.

This is also asserted by the test suite:

```bash
npm test -- capabilities
```

The tests enumerate a list of forbidden names (`encrypt`, `decrypt`, `mask`, `blind_index`, `unmask`, …) and fail if any is registered in either mode.

**Confirm from inside your assistant.** Call `get_server_info`. It reports the active tool list. If it ever lists a cryptographic operation, that is the bug.

---

## 4. "It reads files under the project root you configure"

**This claim is false in `--docs-only` mode** — that mode reads nothing. If that matters to you, use it:

```bash
panda-mcp --docs-only
```

**Scope enforcement.** `src/lint/scanner.ts` (added with Tier 2) resolves every path and refuses to traverse symlinks that escape the configured root. The check is on the *resolved* path, not the string, so `../foo/../../etc/passwd` cannot slip through a prefix comparison.

**What it refuses by default.** `.env` and `.env.*` are excluded unless `--include-env` is passed. Even when included, no matched value is ever emitted — see claim 5.

**Prove it reads nothing.** Run with `--docs-only` against a directory you do not want touched, and confirm the Tier 2 tools are absent from `tools/list`.

---

## 5. "It writes only after you approve"

**In `--docs-only` mode it never writes at all** — the writing tool is not registered.

**In full mode**, `scaffold_integration` proposes changes and requests confirmation before writing. `validate_implementation` is read-only unconditionally: search for a write call in its implementation.

```bash
grep -rn "writeFile\|appendFile\|createWriteStream\|mkdir\|rmdir\|unlink" src/tools/validate.ts
```

Expected: no output.

**Test coverage.** `test/scaffold/confirm.test.ts` asserts that no write occurs without confirmation, in every path — including the conflict path, where a file changed since it was read.

---

## What this document cannot prove

Two honest limitations:

1. **An agentic assistant working in your project can read files regardless of this server.** If your `.env` contains a production `PANDA_KEY_<KID>`, an assistant with filesystem access may read it — through its own file-reading tools, not through this one. That is why production keys should never exist on developer machines.
2. **The claims cover this server, not your assistant.** Whatever your assistant reads, and wherever its model runs, is governed by your choice of assistant and its deployment model. This server neither requires nor makes that choice safe.

Neither limitation is a defect in this server. Both are worth stating plainly rather than leaving a reader to assume stronger protection than exists.

---

## Reporting

If any check above fails on your version, treat it as a security report. See [`SECURITY.md`](./SECURITY.md).
