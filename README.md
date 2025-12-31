# @ecosyste-ms/mcp

MCP server for querying package ecosystem data from [ecosyste.ms](https://packages.ecosyste.ms/).

Queries a local SQLite database of critical packages for fast lookups, with API fallback for packages not in the database.

## Installation

```bash
npm install -g @ecosyste-ms/mcp
```

Or run directly with npx:

```bash
npx @ecosyste-ms/mcp
```

## Database Setup

Download the critical packages database:

```bash
mkdir -p ~/.ecosystems
curl -L https://packages.ecosyste.ms/critical-packages.db -o ~/.ecosystems/critical-packages.db
```

The server looks for the database in these locations (in order):
1. `ECOSYSTEMS_DB_PATH` environment variable
2. `./critical-packages.db` (current directory)
3. `~/.ecosystems/critical-packages.db`

Without a database, the server falls back to API requests for all queries.

## Usage with LLM Tools

<details>
<summary>Claude Code</summary>

Open a terminal and run:

```bash
claude mcp add ecosystems -- npx @ecosyste-ms/mcp
```

With a custom database path:

```bash
claude mcp add ecosystems -- env ECOSYSTEMS_DB_PATH=/path/to/db.sqlite npx @ecosyste-ms/mcp
```

From within Claude Code, use the `/mcp` command to verify the server is running.
</details>

<details>
<summary>Claude Desktop</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ecosystems": {
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"]
    }
  }
}
```

With custom database path:

```json
{
  "mcpServers": {
    "ecosystems": {
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"],
      "env": {
        "ECOSYSTEMS_DB_PATH": "/path/to/critical-packages.db"
      }
    }
  }
}
```
</details>

<details>
<summary>Cursor</summary>

Add to `.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "ecosystems": {
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"]
    }
  }
}
```
</details>

<details>
<summary>VS Code</summary>

Open a terminal and run:

```bash
code --add-mcp '{"type":"stdio","name":"ecosystems","command":"npx","args":["@ecosyste-ms/mcp"]}'
```

Or manually add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "ecosystems": {
      "type": "stdio",
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"]
    }
  }
}
```

Then open the `.vscode/mcp.json` file in VS Code and click "Start server".
</details>

<details>
<summary>Windsurf</summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "ecosystems": {
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"]
    }
  }
}
```
</details>

<details>
<summary>Zed</summary>

Add to Zed settings (`cmd+,`):

```json
{
  "context_servers": {
    "ecosystems": {
      "command": {
        "path": "npx",
        "args": ["@ecosyste-ms/mcp"]
      }
    }
  }
}
```
</details>

<details>
<summary>ChatGPT</summary>

*Note: ChatGPT requires remote MCP servers. Run the server with a tunnel or deploy it.*

For local development with a tunnel:

```bash
npx @anthropic-ai/mcp-proxy --port 8080 -- npx @ecosyste-ms/mcp
```

Then in ChatGPT:
- Navigate to **Settings > Connectors**
- Add a custom connector with your tunnel URL
- The server will be available in Composer > Deep Research
</details>

<details>
<summary>Codex</summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.ecosystems]
command = "npx"
args = ["@ecosyste-ms/mcp"]
```
</details>

<details>
<summary>Gemini CLI</summary>

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ecosystems": {
      "command": "npx",
      "args": ["@ecosyste-ms/mcp"]
    }
  }
}
```
</details>

## Available Tools

### Package Tools

- **get_package** - Get full package data by ecosystem and name
- **lookup_package** - Find package by PURL, ecosystem+name, or repository URL
- **get_package_versions** - Get all versions with publish dates
- **get_package_advisories** - Get security advisories (CVEs)
- **get_package_repository** - Get repository metadata (stars, forks, language)
- **get_package_dependents** - Get packages that depend on this package
- **search_packages** - Full-text search (requires local database)

### Registry Tools

- **list_registries** - List all available package registries
- **get_database_info** - Get local database stats
- **health_check** - Check server health (database connectivity, API availability)

## Examples

Ask your LLM:

- "What license does lodash use?"
- "Show me the CVEs for express"
- "How many stars does the react repository have?"
- "What packages depend on typescript?"
- "Search for packages related to authentication"
- "What's the latest version of axios?"

## Supported Ecosystems

npm, pypi, rubygems, cargo, go, maven, nuget, packagist, hex, pub, hackage, cocoapods, conda, clojars, puppet, homebrew, docker, bower, cpan, cran, julia, swiftpm, elm, deno, alpine, actions, openvsx, spack, adelie, vcpkg, racket, bioconductor, carthage, postmarketos, elpa

## Development

```bash
git clone https://github.com/ecosyste-ms/mcp
cd mcp
npm install
npm test
```

Run locally:

```bash
node index.js
```

## License

MIT
