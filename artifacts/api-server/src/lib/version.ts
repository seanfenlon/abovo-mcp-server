// Server version reported to MCP clients and telemetry. Keep this in sync with
// artifacts/api-server/package.json and the top-level version in
// .mcp/server.json. The mcpb package entry in that manifest stays pinned to the
// already-released 1.1.1 bundle; 1.2.0 adds the hosted remote and does not cut
// a new package.
export const SERVER_VERSION = "1.2.0";
