<!-- mcp-name: io.github.seanfenlon/abovo-mcp-server -->

# ABOVO MCP Server

**Publish any content to a permanent public web page by sending an email.**

No API key. No signup. No authentication required. SMTP is the API.

US Patent No. 10,404,634 — Abovo42 Corporation — Founder: Sean P. Fenlon

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

## Installation & Usage (local stdio)

This server runs locally over **stdio** — there is no hosted or remote endpoint. Both installation methods below download from this repository's [Releases](https://github.com/seanfenlon/abovo-mcp-server/releases) page. Neither one requires an account or a signup anywhere.

### Option 1 — Claude Desktop bundle (recommended)

Download **`abovo-mcp-server-1.1.0.mcpb`** from the [latest release](https://github.com/seanfenlon/abovo-mcp-server/releases/latest) and double-click it.

Claude Desktop opens an install dialog that asks for your email address and your password (or, for Gmail, an [App Password](https://support.google.com/accounts/answer/185833)). The password is handed to your operating system's credential store — macOS Keychain, Windows Credential Manager, or the Linux Secret Service — and is never written into a configuration file in plain text.

There is nothing else to configure and no dependency install step: the bundle carries a single self-contained Node build.

### Option 2 — command line, straight from the release asset

For any MCP client you configure by hand, install the tarball attached to the same release:

```bash
npm install -g https://github.com/seanfenlon/abovo-mcp-server/releases/download/v1.1.0/seanfenlon-abovo-mcp-server-1.1.0.tgz
```

This is a plain URL install — npm fetches the file over HTTPS and never contacts the npm registry, so no npm account or login is involved. It exposes the `abovo-mcp-server` command, a stdio MCP server:

#### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "abovo": {
      "command": "abovo-mcp-server",
      "env": {
        "ABOVO_SMTP_USER": "you@example.com",
        "ABOVO_SMTP_PASS": "your-app-password"
      }
    }
  }
}
```

> **If the client reports that the command was not found,** it is not inheriting your shell's `PATH` — a common situation for GUI applications on macOS. Run `which abovo-mcp-server` (`where abovo-mcp-server` on Windows) and put that absolute path in `"command"` instead.

**Environment variables** — the bundle installer collects these for you through its dialog; set them yourself only for the command-line install:

| Variable | Required | Description |
|----------|----------|-------------|
| `ABOVO_SMTP_USER` | Yes | SMTP username / email address |
| `ABOVO_SMTP_PASS` | Yes | SMTP password or app password |
| `ABOVO_SMTP_HOST` | No | SMTP hostname (default: `smtp.gmail.com`) |
| `ABOVO_SMTP_PORT` | No | SMTP port (default: `587`) |
| `ABOVO_SENDER_EMAIL` | No | From address (defaults to `ABOVO_SMTP_USER`) |
| `ABOVO_TELEMETRY_FILE` | No | Where the telemetry JSONL file is written (see Telemetry below) |
| `ABOVO_TELEMETRY_DISABLED` | No | Set to `1` to disable telemetry completely |

---

## Telemetry

This server records lightweight local telemetry, and it is **on by default**. For each lifecycle or publish event it prints one line to standard error and appends the same line to a JSONL file.

It records **coarse metadata only**: the event name, a timestamp, the server version, the transport, the content format, and whether the target was a personal page or a group. It **never** records subjects, message bodies, email addresses, or credentials.

Where the file goes:

- **Local stdio install (either the bundle or the tarball):** the operating system's temporary directory (`abovo-mcp-telemetry.jsonl`).
- **Otherwise:** a `logs/` folder relative to the working directory.

You can point it elsewhere with the `ABOVO_TELEMETRY_FILE` environment variable, or silence it completely by setting `ABOVO_TELEMETRY_DISABLED` to `1`.

---

## Experimental — known limitations

The `publish_to_web` MCP tool is **experimental**. Current known limitations:

- **No per-caller identity.** All posts are sent from a single, server-configured SMTP identity (`ABOVO_SMTP_USER`). The tool cannot publish as the individual end-user or caller.
- **No exact-URL return.** The tool returns a link to the sender's general ABOVO.co page, not the permanent URL of the specific new post. ABOVO.co emails that per-post URL to the sending address separately.
- **No attachments.** The input schema accepts only `subject`, `body`, `format`, and `group`. File attachments (images, PDFs, other files) cannot be sent through this tool.
- **No idempotency.** Repeated calls with identical arguments send repeated emails and create duplicate posts. There is no deduplication or idempotency key.

---

## Patent Notice

> This project relates to U.S. Patent No. 10,404,634 B2. The open-source license granted for this repository (the MIT License) applies to the copyright in this software only. That license does not, by itself, grant any license or other rights under U.S. Patent No. 10,404,634 B2 beyond those necessary to run this software as provided. No patent license is granted by implication, estoppel, or otherwise, except as expressly set out in a separate written agreement.

---

## Links

- Website: [abovo.co](https://www.abovo.co)
- Downloads: [Releases](https://github.com/seanfenlon/abovo-mcp-server/releases)
- MCP Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- Help: [abovo.co/home/help](https://www.abovo.co/home/help)
