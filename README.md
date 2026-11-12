<!-- mcp-name: io.github.seanfenlon/abovo-mcp-server -->

# ABOVO MCP Server

**Turn any email into a public web page: send it to POST@abovo.co. No login: your email is your login.**

US Patent No. 10,404,634 — Abovo42 Corporation — Founder: Sean P. Fenlon

---

## How ABOVO.co works

Send or forward any email to `POST@abovo.co` and it becomes a permanent public web page. ABOVO emails the sender a confirmation with the page URL and a delete link.

- **No login, ever.** Your email account is your login. There is no ABOVO account, password, API key, or OAuth.
- **Every post needs a verified email sender.** Posts without one are not published. The sender's address is part of the public URL.
- **Attachments:** attach files to the email you send, as in any email app; they appear on the post.
- **Delete anytime:** every post's confirmation email includes a delete link.
- **Groups:** send to `{name}@abovo.co`. The first email to a new group sends the creator a confirmation; clicking **"I accept"** activates the group at `https://{name}.abovo.co` and makes the creator its moderator.
- **Posts are public.** Don't send anything private.

| URL | What it shows |
|-----|---------------|
| `https://www.abovo.co/{sender-email}` | All posts by that sender |
| `https://www.abovo.co/{sender-email}/{post-id}` | One post |
| `https://{groupname}.abovo.co` | A group (e.g. `jazz.abovo.co`) |
| `https://www.abovo.co/Groups` | All groups |

---

## What this MCP server does

It helps an AI assistant use ABOVO correctly. It **never sends email and never publishes anything on its own.**

### `prepare_abovo_post` (read-only)
Builds a ready-to-send email: `to` (`POST@abovo.co`, or `{group}@abovo.co`), `subject`, `body`, and a `mailto:` link. The user sends it from their own email account. To include files, the user attaches them to that email.

| Parameter | Required | Notes |
|---|---|---|
| `subject` | yes | Page title; becomes the email subject |
| `body` | yes | Page content (max 50,000 chars) |
| `format` | no | `text` (default) or `html`. Mailto links carry plain text only |
| `group` | no | Single DNS label (letters, digits, hyphens; 63 max) |

### `get_abovo_info` (read-only)
Reference text for one topic: `capabilities`, `url_format`, `groups`, `use_cases`, `about`.

---

## Connect

**Hosted (recommended): no install, no account, no auth.**

- Endpoint: `https://mcp.abovo.co/api/mcp`
- Transport: Streamable HTTP (stateless)

Add it as a custom connector or remote MCP server in any MCP client that supports remote servers. Example for clients that use a JSON config:

```json
{
  "mcpServers": {
    "abovo": { "type": "http", "url": "https://mcp.abovo.co/api/mcp" }
  }
}
```

**Local stdio bundle (optional, older):** `.mcpb` and `.tgz` assets on [Releases](https://github.com/seanfenlon/abovo-mcp-server/releases). Version 1.1.1 still includes a `publish_to_web` tool that sends through **your own** mailbox's SMTP credentials, which you enter in the installer. Prefer the hosted endpoint above.

---

## Privacy and telemetry

<!-- REVIEWER: confirm against the synced Replit telemetry.ts before merge; GitHub main's telemetry records coarse metadata only. -->
- The hosted server is stateless. It doesn't store subjects, bodies, or email addresses. It records coarse request metadata only (event name, timestamp, version, transport); the hosting provider keeps standard request logs.
- ABOVO.co's privacy policy: https://www.abovo.co/Home/Privacy. Terms: https://www.abovo.co/Home/Terms.
- The local bundle writes coarse telemetry (no content, no addresses) to a JSONL file in the OS temp directory. Set `ABOVO_TELEMETRY_DISABLED=1` to turn it off.

---

## Patent Notice

> This project relates to U.S. Patent No. 10,404,634 B2. The open-source license granted for this repository (the MIT License) applies to the copyright in this software only. That license does not, by itself, grant any license or other rights under U.S. Patent No. 10,404,634 B2 beyond those necessary to run this software as provided. No patent license is granted by implication, estoppel, or otherwise, except as expressly set out in a separate written agreement.

## Links
- Website: https://www.abovo.co
- Help: https://www.abovo.co/home/help
- MCP Registry: `io.github.seanfenlon/abovo-mcp-server` on https://registry.modelcontextprotocol.io
