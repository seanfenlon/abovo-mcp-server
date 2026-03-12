# ABOVO MCP Server — Workspace

## Overview

A Node.js web application ("abovo-mcp-server") that serves two things:

1. **A static website** with AI-discoverable documentation for ABOVO.co (email-to-web publishing platform)
2. **A remote MCP server** at `/mcp` for AI applications (Claude Desktop, Cursor, VS Code, etc.)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **MCP SDK**: @modelcontextprotocol/sdk (Streamable HTTP transport)
- **Email sending**: nodemailer
- **Validation**: Zod
- **Database**: PostgreSQL + Drizzle ORM (available but not used by this app)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Routes

- `GET /` — Developer landing page (HTML with Schema.org JSON-LD)
- `GET /llms.txt` — AI crawler standard (plain text)
- `GET /.well-known/ai-plugin.json` — OpenAI plugin manifest
- `ALL /mcp` — Remote MCP server (Streamable HTTP transport)
- `GET /api/healthz` — Health check

## Structure

```text
artifacts/api-server/
├── src/
│   ├── index.ts          — Entry: reads PORT, starts Express
│   ├── app.ts            — App setup: CORS, routes
│   └── routes/
│       ├── index.ts      — API router (mounted at /api)
│       ├── health.ts     — GET /api/healthz
│       ├── static-pages.ts — GET /, /llms.txt, /.well-known/ai-plugin.json
│       └── mcp.ts        — ALL /mcp (MCP server with Streamable HTTP)
```

## MCP Server

- **Server name**: "abovo", version: "1.0.0"
- **Transport**: Streamable HTTP (stateless mode, `sessionIdGenerator: undefined`)
- **Tools**:
  - `publish_to_web` — Sends email to POST@abovo.co via SMTP
  - `get_abovo_info` — Returns static info about ABOVO.co
- **Resource**: `abovo://documentation` — Full markdown docs for AI agents

## Environment Variables

Set these secrets to enable `publish_to_web` tool:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ABOVO_SMTP_USER` | Yes | — | SMTP username (your email) |
| `ABOVO_SMTP_PASS` | Yes | — | SMTP password (app password) |
| `ABOVO_SMTP_HOST` | No | smtp.gmail.com | SMTP host |
| `ABOVO_SMTP_PORT` | No | 587 | SMTP port |
| `ABOVO_SENDER_EMAIL` | No | ABOVO_SMTP_USER | Override sender address |

## Development

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

## About ABOVO.co

- **Product**: Email-to-web publishing — send email to POST@abovo.co, get a public URL
- **Patent**: US Patent No. 10,404,634
- **Company**: Abovo42 Corporation
- **Founder**: Sean P. Fenlon
- **Incubator**: Cogo Labs / Link Ventures
