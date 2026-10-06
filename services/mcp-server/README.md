# Read-only MCP preview

Separate stdio process. Obtain a 24-hour restricted token from the MCP page as owner; set COMMERCE_MCP_TOKEN in the host process environment, never in committed config. Start node node_modules/tsx/dist/cli.mjs services/mcp-server/server.ts from the project root. COMMERCE_API_URL defaults to http://127.0.0.1:4100 and is restricted to loopback for this preview. Three read-only tools share API authorization and audit. Revoking the credential or membership rejects subsequent requests. No remote OAuth/HTTP or public ChatGPT connector is claimed.
