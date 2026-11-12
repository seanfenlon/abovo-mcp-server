import { Router, type IRouter, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { SERVER_VERSION } from "../lib/version";
import { logEvent } from "../lib/telemetry";

const router: IRouter = Router();

// A group name is placed in the address the user sends to (`{group}@abovo.co`)
// and is also the subdomain of the group page. Anything that is not one DNS
// label could aim that address somewhere other than an ABOVO group.
const GROUP_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const GROUP_MSG =
  "Group name must be a single DNS label: letters, digits and hyphens only, not starting or ending with a hyphen, 63 characters maximum.";

const PREPARE_DESCRIPTION =
  "Prepare a ready-to-send email that publishes a public web page on ABOVO.co. This tool sends nothing: you or your user send the email to POST@abovo.co (or a group address) from your own email account. No login, no API key.";

const INFO_DESCRIPTION =
  "Get information about ABOVO.co capabilities, URL formats, groups, or use cases.";

function preparePostText(input: {
  to: string;
  subject: string;
  body: string;
  format: "text" | "html";
}): string {
  const mailto =
    `mailto:${input.to}?subject=${encodeURIComponent(input.subject)}` +
    `&body=${encodeURIComponent(input.body)}`;
  return [
    "Nothing has been sent. Send this email from your own email account:",
    "",
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Format: ${input.format}`,
    "Body:",
    input.body,
    "",
    `Mailto link: ${mailto}`,
    "",
    "Send this email from your own email account. ABOVO.co has no login and no account: your email account is your login. The post URL will be https://www.abovo.co/<your email>/<post id>. Attach files to the email normally and they appear on the post. Every post's confirmation email includes a delete link that removes the post.",
  ].join("\n");
}

const INFO: Record<string, string> = {
  capabilities: [
    "ABOVO.co Capabilities:",
    "",
    "• Publish any content to the web instantly by sending an email to POST@abovo.co",
    "• Receive a public URL back within seconds — no waiting, no signup",
    "• No API key, no authentication, no registration required",
    "• No login is ever required; your email account is your login. Posts without a verified email sender are not published.",
    "• Every post gets a confirmation email to the sender with a delete link; clicking it removes the post.",
    "• SMTP is the API — any email client or SMTP library works",
    "• Supported content: plain text, HTML (fully rendered), images and PDFs; attach any files to the email you send (ABOVO handles attachments like any email client)",
    "• Free to use",
    "• Groups: send to [groupname]@abovo.co to post to or create a topic group",
    "  — First email to a new group triggers a confirmation email to the sender",
    "  — Sender must click 'I accept' to activate the group; they become moderator",
    "  — Group page lives at: https://{groupname}.abovo.co (subdomain)",
    "• Each sender gets a personal page at abovo.co/{your-email}",
    "• Patent US 10,404,634",
  ].join("\n"),

  url_format: [
    "ABOVO.co URL Patterns:",
    "",
    "• User page: https://www.abovo.co/{sender-email}",
    "  — Shows all posts published by that email address",
    "",
    "• Individual post: https://www.abovo.co/{sender-email}/{post-id}",
    "  — Direct link to a specific published page",
    "",
    "• Groups browser: https://www.abovo.co/Groups",
    "  — Browse all public groups",
    "",
    "• Group page: https://{groupname}.abovo.co",
    "  — All posts in a specific group (subdomain, not a path)",
    "",
    "Example: POST@abovo.co → ABOVO emails you back: https://www.abovo.co/you@example.com/abc123",
  ].join("\n"),

  groups: [
    "ABOVO.co Groups:",
    "",
    "• Groups let you publish to a shared topic channel",
    "• Send email to: [groupname]@abovo.co (e.g. announcements@abovo.co)",
    "• Creating a new group requires moderator confirmation:",
    "  1. Send the first email to [groupname]@abovo.co",
    "  2. ABOVO sends a confirmation email back to you",
    "  3. Click 'I accept' in that email — you become the group moderator",
    "  4. Until confirmed, the group does not appear on ABOVO.co",
    "• Group page lives at: https://{groupname}.abovo.co (subdomain)",
    "  — Example: https://jazz.abovo.co",
    "• Anyone can post to or read any active group — no permissions required",
    "• Great for team updates, newsletters, shared archives, community threads",
    "• Browse all groups at: https://www.abovo.co/Groups",
  ].join("\n"),

  use_cases: [
    "ABOVO.co Use Cases for AI Agents:",
    "",
    "• Publish research findings — send a report email, get a shareable URL instantly",
    "• Instant blog / knowledge base — email your content, get a permanent public page",
    "• Share files & attachments - attach them to the email you send (ABOVO handles them like any email client) and they are rendered on the page",
    "• Archive content — permanent URLs for AI-generated content",
    "• Team groups — post updates to shared channels via email",
    "• Webhook results — pipe API responses to a public page for sharing",
    "• No-code publishing — works from any automation that can send email",
    "• Conversational publishing — an AI assistant can publish summaries on demand",
    "• Zero-auth sharing — share anything without requiring the recipient to log in",
  ].join("\n"),

  about: [
    "About ABOVO.co:",
    "",
    "• Product: ABOVO.co — Email-to-Web Publishing Platform",
    "• Company: Abovo42 Corporation",
    "• Founder: Sean P. Fenlon",
    "• Patent: US Patent No. 10,404,634",
    "• Incubator: Cogo Labs / Link Ventures",
    "",
    "ABOVO.co's core insight: email is the most universal API ever built.",
    "Every device, language, and platform can send email.",
    "ABOVO makes the web equally accessible — send an email, get a web page.",
    "",
    "• Help: https://www.abovo.co/home/help",
    "• Terms: https://www.abovo.co/Home/Terms",
    "• Website: https://www.abovo.co",
  ].join("\n"),
};

const DOCUMENTATION = [
  "# ABOVO.co — Complete Documentation for AI Agents",
  "",
  "## Overview",
  "",
  "ABOVO.co is an email-to-web publishing platform. Send any email to POST@abovo.co and it instantly becomes a public web page. The sender receives a URL back within seconds.",
  "",
  "**No signup. No API key. No authentication required.**",
  "",
  "SMTP is the API.",
  "",
  "Patent: US Patent No. 10,404,634",
  "Company: Abovo42 Corporation | Founder: Sean P. Fenlon",
  "",
  "## Email API",
  "",
  "### Publishing Content",
  "",
  "Send any email to: `POST@abovo.co`",
  "",
  "- Subject line becomes the page title",
  "- Email body becomes the page content",
  "- Attachments work by attaching files (images, PDFs, etc.) to the email you send; ABOVO handles them like any email client and renders them on the page",
  "- Code can be inline in the email body, or attached as a .txt file",
  "- HTML email is fully rendered",
  "- Plain text is also supported",
  "- ABOVO emails the sender back with their public URL",
  "- Every post gets a confirmation email to the sender with a delete link; clicking it removes the post.",
  "- No login is ever required; your email account is your login. Posts without a verified email sender are not published.",
  "",
  "### Groups",
  "",
  "Send email to: `[groupname]@abovo.co`",
  "",
  "- Posts to an existing group, or creates a new one",
  "- Creating a new group: ABOVO sends a confirmation email to the first poster",
  "- The first poster must click 'I accept' to activate the group and become moderator",
  "- Until confirmed, the group does not appear on ABOVO.co",
  "- Group page: https://{groupname}.abovo.co (subdomain — e.g. https://jazz.abovo.co)",
  "- All groups browsable at: https://www.abovo.co/Groups",
  "",
  "## URL Patterns",
  "",
  "| Pattern | Description |",
  "|---------|-------------|",
  "| `https://www.abovo.co/{sender-email}` | User's page — all their posts |",
  "| `https://www.abovo.co/{sender-email}/{post-id}` | Individual post |",
  "| `https://{groupname}.abovo.co` | Group page (subdomain) |",
  "| `https://www.abovo.co/Groups` | Browse all groups |",
  "",
  "## Supported Content Types",
  "",
  "- Plain text",
  "- HTML (fully rendered)",
  "- Images (JPEG, PNG, GIF, WebP)",
  "- PDF documents",
  "- Any file attachment",
  "- Code, either inline in the email body or attached as a .txt file",
  "",
  "## Integration Examples",
  "",
  "These examples send from your own mailbox. This MCP server does not send them for you.",
  "",
  "### Python (smtplib)",
  "",
  "```python",
  "import smtplib",
  "from email.mime.text import MIMEText",
  "",
  "msg = MIMEText('<h1>Hello World</h1><p>Published via ABOVO.</p>', 'html')",
  "msg['Subject'] = 'My First ABOVO Post'",
  "msg['From'] = 'you@example.com'",
  "msg['To'] = 'POST@abovo.co'",
  "",
  "with smtplib.SMTP('smtp.gmail.com', 587) as s:",
  "    s.starttls()",
  "    s.login('you@example.com', 'your-app-password')",
  "    s.send_message(msg)",
  "```",
  "",
  "### Node.js (nodemailer)",
  "",
  "```javascript",
  "const nodemailer = require('nodemailer');",
  "const transporter = nodemailer.createTransport({",
  "  host: 'smtp.gmail.com', port: 587,",
  "  auth: { user: 'you@example.com', pass: 'your-app-password' }",
  "});",
  "await transporter.sendMail({",
  "  from: 'you@example.com',",
  "  to: 'POST@abovo.co',",
  "  subject: 'My ABOVO Post',",
  "  html: '<h1>Published!</h1>'",
  "});",
  "```",
  "",
  "## Cost",
  "",
  "Free.",
  "",
  "## Links",
  "",
  "- Website: https://www.abovo.co",
  "- Help: https://www.abovo.co/home/help",
  "- Groups: https://www.abovo.co/Groups",
  "- Terms: https://www.abovo.co/Home/Terms",
  "- MCP endpoint: https://mcp.abovo.co/api/mcp",
].join("\n");

export function createMcpServer() {
  const server = new McpServer({
    name: "abovo",
    version: SERVER_VERSION,
  });

  server.tool(
    "prepare_abovo_post",
    PREPARE_DESCRIPTION,
    {
      subject: z.string().describe("Post title; becomes the email subject."),
      body: z
        .string()
        .max(50000)
        .describe("Post content; becomes the email body."),
      format: z
        .enum(["text", "html"])
        .default("text")
        .describe("text (default) or html. Mailto links carry plain text only."),
      group: z
        .string()
        .regex(GROUP_RE, GROUP_MSG)
        .optional()
        .describe(
          "Optional ABOVO group name; the email goes to {group}@abovo.co instead of POST@abovo.co.",
        ),
    },
    {
      title: "Prepare ABOVO post email",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ subject, body, format, group }) => {
      // Coarse metadata only — never the subject, body, or any address.
      const target = group ? "group" : "personal";
      logEvent("prepare_post", { format, target });

      const to = group ? `${group}@abovo.co` : "POST@abovo.co";
      return {
        content: [
          {
            type: "text" as const,
            text: preparePostText({ to, subject, body, format }),
          },
        ],
      };
    },
  );

  server.tool(
    "get_abovo_info",
    INFO_DESCRIPTION,
    {
      query: z
        .enum(["capabilities", "url_format", "groups", "use_cases", "about"])
        .describe(
          "Topic to return. Allowed values: capabilities, url_format, groups, use_cases, about.",
        ),
    },
    {
      title: "Get ABOVO info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ query }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: INFO[query] || "Unknown query type.",
          },
        ],
      };
    },
  );

  server.resource(
    "abovo://documentation",
    "abovo://documentation",
    { mimeType: "text/markdown" },
    async () => ({
      contents: [
        {
          uri: "abovo://documentation",
          mimeType: "text/markdown",
          text: DOCUMENTATION,
        },
      ],
    }),
  );

  return server;
}

router.all("/mcp", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Telemetry: record tools/list discovery calls (JSON-RPC method inspection
  // only — no request body or arguments are logged).
  try {
    const body: unknown = req.body;
    const messages = Array.isArray(body) ? body : [body];
    if (messages.some((m) => (m as { method?: string } | null)?.method === "tools/list")) {
      logEvent("tools_list");
    }
  } catch {
    // Ignore — telemetry must not affect request handling.
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;
