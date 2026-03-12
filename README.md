# ABOVO MCP Server

**Publish any content to a permanent public web page by sending an email.**

No API key. No signup. No authentication required. SMTP is the API.

US Patent No. 10,404,634 — Abovo42 Corporation — Founder: Sean P. Fenlon

<a href="https://glama.ai/mcp/servers/seanfenlon/abovo-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/seanfenlon/abovo-mcp-server/badge" alt="ABOVO Server MCP server" />
</a>

---

## Remote MCP Server

Connect any MCP-compatible AI client directly — no installation needed:

```
Transport: Streamable HTTP
URL: https://abovo.replit.app/mcp
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "abovo": {
      "url": "https://abovo.replit.app/mcp"
    }
  }
}
```

---

## How It Works

Send any email to `POST@abovo.co` and it instantly becomes a public web page. ABOVO replies with your permanent URL within seconds.

| Action | Email To |
|--------|----------|
| Publish to personal page | `POST@abovo.co` |
| Post to a group | `[groupname]@abovo.co` |

### URL Patterns

| URL | Description |
|-----|-------------|
| `https://www.abovo.co/{sender-email}` | All posts by that sender |
| `https://www.abovo.co/{sender-email}/{post-id}` | Specific post |
| `https://{groupname}.abovo.co` | Group page (e.g. `jazz.abovo.co`) |

### Group Moderation

When you send the first email to a new `[groupname]@abovo.co`, ABOVO sends you a confirmation email. Click **"I accept"** to activate the group — you become the moderator. Until confirmed, the group does not appear on ABOVO.co.

---

## MCP Tools

### `publish_to_web`

Publishes content to ABOVO.co by sending an email via SMTP.

**Parameters:**
- `subject` (required) — page title
- `body` (required) — page content (plain text or HTML)
- `group` (optional) — post to a group instead of personal page

**Returns:** The public URL of the published page.

### `get_abovo_info`

Returns information about ABOVO.co capabilities, URL formats, groups, or use cases.

**Query values:** `capabilities`, `url_format`, `groups`, `use_cases`, `about`

---

## Local stdio Installation (npm)

For running the MCP server locally via stdio (e.g. for offline use or SMTP relay):

```bash
npm install -g @seanfenlon/abovo-mcp-server
```

**Required environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `ABOVO_SMTP_USER` | Yes | SMTP username / email address |
| `ABOVO_SMTP_PASS` | Yes | SMTP password or app password |
| `ABOVO_SMTP_HOST` | No | SMTP hostname (default: `smtp.gmail.com`) |
| `ABOVO_SMTP_PORT` | No | SMTP port (default: `587`) |
| `ABOVO_SENDER_EMAIL` | No | From address (defaults to `ABOVO_SMTP_USER`) |

---

## Links

- Website: [abovo.co](https://www.abovo.co)
- Developer docs: [abovo.replit.app](https://abovo.replit.app)
- MCP Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- Help: [abovo.co/home/help](https://www.abovo.co/home/help)