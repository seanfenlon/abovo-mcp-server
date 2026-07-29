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

// Telemetry is on by default; set ABOVO_TELEMETRY_DISABLED=1 to silence it.
const TELEMETRY_DISABLED = process.env.ABOVO_TELEMETRY_DISABLED === "1";

// The target file is resolved lazily at each write (not at module load) so
// entrypoints can point ABOVO_TELEMETRY_FILE somewhere sensible before the
// first event — e.g. the stdio entrypoint redirects it to the OS temp dir so
// a local install never creates a stray logs/ folder in the user's cwd.
let ensuredDirFor: string | null = null;

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
  const telemetryFile =
    process.env.ABOVO_TELEMETRY_FILE || "logs/telemetry.jsonl";
  void (async () => {
    try {
      if (ensuredDirFor !== telemetryFile) {
        await mkdir(dirname(telemetryFile), { recursive: true });
        ensuredDirFor = telemetryFile;
      }
      await appendFile(telemetryFile, line + "\n", "utf8");
    } catch {
      // Intentionally ignored — telemetry must not affect request handling.
    }
  })();
}
