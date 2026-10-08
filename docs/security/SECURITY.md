# Security Policy

## Reporting a vulnerability

Report security issues privately to **Bidang Persandian dan Keamanan Aplikasi, Dinas Komunikasi dan Informatika Provinsi Jawa Timur**.

Do not open a public issue for a security report.

Please include:

- What you found, and which claim in [`VERIFYING.md`](./VERIFYING.md) it contradicts
- The version (`panda-mcp --version`) and how you installed it
- A minimal reproduction

We will acknowledge within **3 working days** and aim to ship a fix or a documented mitigation within **30 days**, faster if the issue is exploitable.

## What counts as a security issue here

This server has an unusually narrow surface, which makes the interesting failures specific:

| Severity | Issue |
|---|---|
| **Critical** | Any cryptographic operation becomes reachable — an `encrypt`, `decrypt`, `mask`, or `blind_index` tool appears in any configuration |
| **Critical** | The server reads, requests, or stores encryption key material |
| **Critical** | The server makes a network request, or a network transport is imported |
| **Critical** | The server writes any file. It proposes; the client writes. |
| **High** | A tool reads outside the configured project root, including via symlink escape |
| **High** | A finding, log line, or error message contains a matched value from scanned source |
| **High** | `--docs-only` fails to withhold a Tier 2 tool |
| **Medium** | `.env` files are scanned without `--include-env` |
| **Low** | Bundled documentation is stale relative to its sources |

## Out of scope

- **The assistant reading your files by other means.** An agentic assistant with filesystem access can read `.env` through its own tools. This server does not control that, and `VERIFYING.md` says so explicitly.
- **Vulnerabilities in PANDA SDKs.** Report those against the relevant repository.
- **Vulnerabilities in the MCP client or the model provider.**
- **Findings that consist only of the documentation text.** `src/content/generated.ts` contains documentation that includes example code and, occasionally, example credentials in prose. Those are documentation strings, not secrets.

## Design invariants

Three properties are not features and will not be traded away in a future release. A pull request that breaks any of them should be rejected on that basis alone:

1. **No cryptographic operation, under any configuration.**
2. **No key material, ever.**
3. **No network requests, ever.**

The reasoning is in the README and in PRD 005 Section 6. The short version: a tool that takes plaintext as an argument puts it into a model's context, and a model's context is not a place for citizens' personal data.

## Supported versions

This package is pre-1.0. Security fixes are applied to the latest release only.
