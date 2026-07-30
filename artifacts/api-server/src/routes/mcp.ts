import { Router, type IRouter, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import nodemailer from "nodemailer";
import { SERVER_VERSION } from "../lib/version";
import { logEvent } from "../lib/telemetry";

const router: IRouter = Router();

export function createMcpServer() {
  const server = new McpServer({
    name: "abovo",
    version: SERVER_VERSION,
  });

  server.tool(
    "publish_to_web",
    "Publish content to a public web page on ABOVO.co by emailing it through a single, server-configured SMTP identity. Accepts a subject, body, format (text or html), and an optional group. Does NOT support file attachments — the input schema is limited to subject/body/format/group. Returns a confirmation and a link to the sender's ABOVO.co page; it does NOT return the exact URL of the new post (ABOVO.co emails that permanent URL to the sending address separately). Not idempotent: repeated calls create duplicate posts.",
    {
      subject: z.string().describe("Subject line / title of the web page"),
      body: z.string().describe("Content to publish. Can be plain text or HTML."),
      format: z.enum(["text", "html"]).default("html").describe("Content format"),
      group: z.string().optional().describe("Group name. If provided, posts to [group]@abovo.co instead"),
    },
    {
      title: "Publish to ABOVO.co",
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    async ({ subject, body, format, group }) => {
      // Telemetry: coarse metadata only — never the subject, body, or any address.
      const target = group ? "group" : "personal";
      logEvent("publish_attempt", { format, target });

      const smtpUser = process.env.ABOVO_SMTP_USER;
      const smtpPass = process.env.ABOVO_SMTP_PASS;

      if (!smtpUser || !smtpPass) {
        logEvent("publish_failure", { format, target, reason: "smtp_not_configured" });
        return {
          content: [
            {
              type: "text" as const,
              text: [
                "SMTP credentials not configured. To use publish_to_web, set these environment variables:",
                "",
                "  ABOVO_SMTP_USER  — Your email address (used to send from)",
                "  ABOVO_SMTP_PASS  — Your email password or app password",
                "  ABOVO_SMTP_HOST  — SMTP host (default: smtp.gmail.com)",
                "  ABOVO_SMTP_PORT  — SMTP port (default: 587)",
                "  ABOVO_SENDER_EMAIL — Override sender address (defaults to SMTP_USER)",
                "",
                "For Gmail, use an App Password: https://support.google.com/accounts/answer/185833",
              ].join("\n"),
            },
          ],
        };
      }

      const smtpHost = process.env.ABOVO_SMTP_HOST || "smtp.gmail.com";
      const smtpPort = parseInt(process.env.ABOVO_SMTP_PORT || "587", 10);
      const senderEmail = process.env.ABOVO_SENDER_EMAIL || smtpUser;
      const destination = group ? `${group}@abovo.co` : "POST@abovo.co";

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        // Refuse to send credentials over an unencrypted connection. On 587
        // nodemailer upgrades via STARTTLS opportunistically; without this
        // flag a network attacker who strips the server's upgrade offer gets
        // the SMTP password in the clear. Harmless when implicit TLS is on.
        requireTLS: true,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      try {
        await transporter.sendMail({
          from: senderEmail,
          to: destination,
          subject: subject,
          ...(format === "html" ? { html: body } : { text: body }),
        });
      } catch (err) {
        // Reason is the transport error message (e.g. "Invalid login"),
        // truncated. It does not include credentials or the message body.
        const reason = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        logEvent("publish_failure", { format, target, reason });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to send to ABOVO.co: ${reason}`,
            },
          ],
        };
      }

      logEvent("publish_success", { format, target });

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Successfully sent to ${destination}`,
              "",
              "ABOVO.co will process your email and reply to the sending address with the",
              "permanent URL of this specific post within seconds. This tool does not receive",
              "that per-post URL and cannot return it.",
              "",
              `Sender's ABOVO.co page (all of this sender's posts): https://www.abovo.co/${encodeURIComponent(senderEmail)}/`,
              group
                ? `Group page: https://${group}.abovo.co`
                : "",
            ].filter(Boolean).join("\n"),
          },
        ],
      };
    }
  );

  server.tool(
    "get_abovo_info",
    "Get information about ABOVO.co capabilities, URL formats, groups, or use cases.",
    {
      query: z
        .enum(["capabilities", "url_format", "groups", "use_cases", "about"])
        .describe("What information to retrieve about ABOVO.co"),
    },
    async ({ query }) => {
      const responses: Record<string, string> = {
        capabilities: [
          "ABOVO.co Capabilities:",
          "",
          "• Publish any content to the web instantly by sending an email to POST@abovo.co",
          "• Receive a public URL back within seconds — no waiting, no signup",
          "• No API key, no authentication, no registration required",
          "• SMTP is the API — any email client or SMTP library works",
          "• Supported content: plain text, HTML (fully rendered), images, PDFs, any file attachments",
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
          "• Share files & attachments — images, PDFs, docs all rendered on the page",
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

      return {
        content: [
          {
            type: "text" as const,
            text: responses[query] || "Unknown query type.",
          },
        ],
      };
    }
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
          text: [
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
            "- Any attachments (images, PDFs, files) are rendered on the page",
            "- HTML email is fully rendered",
            "- Plain text is also supported",
            "- ABOVO emails the sender back with their public URL",
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
            "",
            "## Integration Examples",
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
          ].join("\n"),
        },
      ],
    })
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
