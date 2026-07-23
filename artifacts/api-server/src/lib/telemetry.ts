// Lightweight, best-effort telemetry.
//
// Emits one JSON object per line (JSONL) for a small set of lifecycle and
// publish events. By design this logger records ONLY coarse metadata:
//   - never message bodies or subjects
//   - never SMTP credentials, env values, or email addresses
// Callers are responsible for passing only non-sensitive fields in `data`.
//
// Writes are fire-and-forget and never throw into the request path: a failure
// to write telemetry must never affect the server's behavior.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type TelemetryEvent =
  | "server_init"
  | "tools_list"
  | "publish_attempt"
  | "publish_success"
  | "publish_failure";

const TELEMETRY_FILE = process.env.ABOVO_TELEMETRY_FILE || "logs/telemetry.jsonl";
// Telemetry is on by default; set ABOVO_TELEMETRY_DISABLED=1 to silence it.
const TELEMETRY_DISABLED = process.env.ABOVO_TELEMETRY_DISABLED === "1";

let dirEnsured = false;

export function logEvent(
  event: TelemetryEvent,
  data: Record<string, unknown> = {},
): void {
  if (TELEMETRY_DISABLED) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...data,
  });

  // Surface to stderr (not stdout): in stdio transport mode stdout carries the
  // MCP JSON-RPC stream, so logging there would corrupt the protocol. stderr is
  // safe in both HTTP and stdio modes and still lands in the platform log stream.
  console.error(`[telemetry] ${line}`);

  // Best-effort append to a JSONL file; swallow all errors.
  void (async () => {
    try {
      if (!dirEnsured) {
        await mkdir(dirname(TELEMETRY_FILE), { recursive: true });
        dirEnsured = true;
      }
      await appendFile(TELEMETRY_FILE, line + "\n", "utf8");
    } catch {
      // Intentionally ignored — telemetry must not affect request handling.
    }
  })();
}
