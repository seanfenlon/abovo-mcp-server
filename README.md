<!-- mcp-name: io.github.seanfenlon/abovo-mcp-server -->

# ABOVO MCP Server

**Publish any content to a permanent public web page by sending an email.**

No API key. No signup. No authentication required. SMTP is the API.

US Patent No. 10,404,634 — Abovo42 Corporation — Founder: Sean P. Fenlon

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

Publishes content to ABOVO.co by sending an email through a **single, server-configured SMTP identity** (`ABOVO_SMTP_USER`). The tool does not publish as the individual end-user or caller — every post originates from the one identity the server is configured with.

**Parameters:**
- `subject` (required) — page title
- `body` (required) — page content (plain text or HTML)
- `format` (optional, default `html`) — `text` or `html`
- `group` (optional) — post to a group (`[group]@abovo.co`) instead of the personal page

> **Note:** This tool does **not** accept file attachments. The input schema is limited to `subject`, `body`, `format`, and `group`.

**Returns:** A confirmation that the email was sent, plus a link to the **sender's ABOVO.co page** (`https://www.abovo.co/{sender}/`), which lists all of that sender's posts. It does **not** return the exact URL of the newly created post — ABOVO.co emails that permanent per-post URL to the sending address separately, after processing. See [Experimental — known limitations](#experimental--known-limitations).

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

## Experimental — known limitations

The `publish_to_web` MCP tool is **experimental**. Current known limitations:

- **No per-caller identity.** All posts are sent from a single, server-configured SMTP identity (`ABOVO_SMTP_USER`). The tool cannot publish as the individual end-user or caller.
- **No exact-URL return.** The tool returns a link to the sender's general ABOVO.co page, not the permanent URL of the specific new post. ABOVO.co emails that per-post URL to the sending address separately.
- **No attachments.** The input schema accepts only `subject`, `body`, `format`, and `group`. File attachments (images, PDFs, other files) cannot be sent through this tool.
- **No idempotency.** Repeated calls with identical arguments send repeated emails and create duplicate posts. There is no deduplication or idempotency key.

---

## Patent Notice

> **DRAFT — FOR COUNSEL REVIEW**
>
> This project relates to U.S. Patent No. 10,404,634 B2. The open-source license granted for this repository (the MIT License) applies to the copyright in this software only. That license does not, by itself, grant any license or other rights under U.S. Patent No. 10,404,634 B2 beyond those necessary to run this software as provided. No patent license is granted by implication, estoppel, or otherwise, except as expressly set out in a separate written agreement.

---

## Links

- Website: [abovo.co](https://www.abovo.co)
- Developer docs: [abovo.replit.app](https://abovo.replit.app)
- MCP Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- Help: [abovo.co/home/help](https://www.abovo.co/home/help)
