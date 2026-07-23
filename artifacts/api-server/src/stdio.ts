// Local stdio entrypoint for the ABOVO MCP server (npm `bin`).
//
// This is the canonical local-install rail: `npm install -g
// @seanfenlon/abovo-mcp-server` exposes the `abovo-mcp-server` command, which
// runs the same MCP server (createMcpServer) over stdio. stdout is reserved for
// the MCP JSON-RPC stream; all logging goes to stderr (see lib/telemetry).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./routes/mcp";
import { SERVER_VERSION } from "./lib/version";
import { logEvent } from "./lib/telemetry";

async function main(): Promise<void> {
  logEvent("server_init", { version: SERVER_VERSION, transport: "stdio" });
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting ABOVO MCP stdio server:", err);
  process.exit(1);
});
