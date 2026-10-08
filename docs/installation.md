# Installation

## Requirements

- Node.js 20 or later
- An MCP-capable client — Claude Code, Claude Desktop, Cursor, VS Code, or any client speaking the Model Context Protocol

## Standard install

`npx` fetches and runs the package without a global install. Pin a version in production so an upstream release cannot change behaviour under you:

```jsonc
{
  "mcpServers": {
    "panda": {
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp@0.1.0"]
    }
  }
}
```

## Documentation-only mode

Reads no local files at all. Use this when you want the assistant to know PANDA but not to scan your codebase — or when your security policy does not permit a tool with filesystem access.

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

Tier 2 tools (`validate_implementation`, `explain_envelope`, `scaffold_integration`) are **not registered** in this mode. A model cannot call a tool it cannot see, so this is a real reduction in surface rather than a display preference.

## Per-client configuration

### Claude Code

Add to `.mcp.json` in your project, or use `claude mcp add`:

```bash
claude mcp add panda -- npx -y @jatimprovcsirt/panda-mcp
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "panda": {
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp"]
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`, or the MCP section in Settings:

```jsonc
{
  "mcpServers": {
    "panda": {
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp"]
    }
  }
}
```

### VS Code

`.vscode/mcp.json` in your workspace:

```jsonc
{
  "servers": {
    "panda": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@jatimprovcsirt/panda-mcp"]
    }
  }
}
```

## Air-gapped installs

For networks with no route to the npm registry:

```bash
# on a connected machine
npm pack @jatimprovcsirt/panda-mcp
# transfer the resulting .tgz, then on the isolated machine
npm install -g jatimprovcsirt-panda-mcp-0.1.0.tgz
```

Then point your client at the installed binary:

```jsonc
{
  "mcpServers": {
    "panda": { "command": "panda-mcp" }
  }
}
```

The server makes no network requests in any mode, so an air-gapped install is fully functional — not a degraded one.

## Options

```
--docs-only             Documentation tools only. Reads no local files.
--project-root <path>   Root directory for file scanning. Default: cwd.
--include-env           Include .env files when scanning. Off by default;
                        matched values are never echoed either way.
--version, -v
--help, -h
```

## Troubleshooting

**The server does not appear in my client.**
Run it directly to see the startup banner, which goes to stderr:

```bash
npx -y @jatimprovcsirt/panda-mcp --docs-only
```

You should see the version, content summary, and generation timestamp. If it exits immediately with an error, that is the cause.

**Tools are missing.**
Check whether `--docs-only` is set — it withholds the Tier 2 tools by design. Call `get_server_info`; it reports the active tool list and, in docs-only mode, which tools were withheld.

**The assistant still invents PANDA APIs.**
Ask it explicitly to call `search_docs` or `get_api_reference` before writing code. The server's connection instructions tell it to do so, but a model under pressure from a large context will sometimes skip that step. Saying "look it up in the panda server first" reliably fixes it.
