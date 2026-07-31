// End-to-end proof that the bundle we are about to ship actually runs.
//
// Why this exists: every previous release was verified by reading the source.
// Reading the source is how three real defects shipped anyway — a tool with a
// null annotations block, documentation that contradicted the tool's own input
// schema, and a validation gap that let the `group` parameter inject a second
// envelope recipient. All three were found by starting the bundle and talking
// to it. This script does that mechanically, so it happens on every release
// instead of whenever someone remembers.
//
// It speaks real MCP over stdio to dist/stdio.cjs — newline-delimited JSON-RPC,
// no framing headers, exactly as an MCP host would. It has no dependencies and
// runs on a bare Node 18+ runtime, so it works unchanged on a CI runner.
//
// Deliberately runs with NO SMTP credentials. That is the safe posture for CI
// (nothing can be sent) and it is also the interesting one: the unconfigured
// path is a documented, reachable branch, and it regressed once already by
// reporting isError:false while telemetry logged a failure.
//
// Usage:  node ./smoke-stdio.mjs [path/to/stdio.cjs]
// Exit 0 = every assertion passed. Exit 1 = do not release.

import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entry = path.resolve(
  process.argv[2] ?? path.join(__dirname, "dist", "stdio.cjs"),
);

const pkg = JSON.parse(
  await readFile(path.join(__dirname, "package.json"), "utf-8"),
);
const expectedVersion = pkg.version;

const failures = [];
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(detail ? `${name} — ${detail}` : name);
}

// ---------------------------------------------------------------------------
// A minimal MCP stdio client.
// ---------------------------------------------------------------------------

class StdioClient {
  constructor(entryPath) {
    // Strip every ABOVO_* variable out of the child's environment. Without this
    // the test's meaning depends on whoever happens to be running it: a
    // developer with real credentials exported would exercise a completely
    // different branch than CI does, and could send live mail from a smoke test.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("ABOVO_")),
    );
    this.proc = spawn(process.execPath, [entryPath], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.buffer = "";

    this.proc.stdout.setEncoding("utf-8");
    this.proc.stdout.on("data", (chunk) => this.#onData(chunk));
    this.proc.stderr.setEncoding("utf-8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
  }

  #onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        // A non-JSON line on stdout is itself a bug: stdout is the transport,
        // and anything that is not a JSON-RPC message corrupts the stream.
        failures.push(`non-JSON line on stdout: ${line.slice(0, 120)}`);
        continue;
      }
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        this.pending.delete(msg.id);
        waiter(msg);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for a response to ${method}`));
      }, 20000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.proc.stdin.write(payload + "\n");
    });
  }

  notify(method, params) {
    this.proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
    );
  }

  close() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}

// ---------------------------------------------------------------------------

const client = new StdioClient(entry);

try {
  // --- handshake ---------------------------------------------------------
  const init = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "abovo-release-smoke", version: "1.0.0" },
  });
  client.notify("notifications/initialized", {});

  const info = init.result?.serverInfo ?? {};
  check("initialize returns a result", Boolean(init.result), JSON.stringify(init.error ?? {}));
  check("serverInfo.name is abovo", info.name === "abovo", `got ${info.name}`);
  check(
    "serverInfo.version matches package.json",
    info.version === expectedVersion,
    `package.json says ${expectedVersion}, the running server reports ${info.version}`,
  );

  // --- tools -------------------------------------------------------------
  const list = await client.request("tools/list", {});
  const tools = list.result?.tools ?? [];
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  check("tools/list returns publish_to_web", Boolean(byName.publish_to_web));
  check("tools/list returns get_abovo_info", Boolean(byName.get_abovo_info));

  // Annotations are how a host decides whether a tool is safe to call without
  // asking. get_abovo_info shipped 1.1.0 with annotations:null, which makes a
  // pure read look exactly like a tool that sends mail.
  for (const name of ["publish_to_web", "get_abovo_info"]) {
    const ann = byName[name]?.annotations;
    check(
      `${name} declares annotations`,
      ann && typeof ann === "object",
      `annotations is ${JSON.stringify(ann)}`,
    );
  }
  check(
    "get_abovo_info is annotated read-only",
    byName.get_abovo_info?.annotations?.readOnlyHint === true,
  );
  check(
    "publish_to_web is annotated as NOT read-only",
    byName.publish_to_web?.annotations?.readOnlyHint !== true,
  );

  // --- the group parameter must not accept an address list ---------------
  //
  // `group` is interpolated straight into an email address, and nodemailer
  // parses that string as an address LIST. An unconstrained value is therefore
  // recipient injection: the caller picks a second, arbitrary recipient and the
  // mail leaves through the operator's own authenticated mailbox. Proven
  // against nodemailer's jsonTransport before the fix — these two payloads each
  // produced two envelope recipients. They must now be rejected by the schema,
  // before any transport is touched.
  const injectionPayloads = [
    "attacker@example.invalid, jazz",
    "x <attacker@example.invalid>, jazz",
    "jazz@abovo.co",
    "-leading-hyphen",
    "has space",
  ];
  //
  // The SDK surfaces a schema violation as a result with isError:true whose
  // text carries the JSON-RPC code, not as a transport-level error object — so
  // "was it rejected" is not enough on its own. The load-bearing assertion is
  // WHERE it was rejected: validation must fire before the handler runs, which
  // means the reply must never be the handler's own "SMTP credentials not
  // configured" message. That message would prove the bad value passed the
  // schema and reached the send path, where only a missing credential stopped
  // it — i.e. the vulnerability, still present, masked by an empty CI
  // environment.
  for (const group of injectionPayloads) {
    const res = await client.request("tools/call", {
      name: "publish_to_web",
      arguments: { subject: "smoke", body: "smoke", group },
    });
    const text = res.result?.content?.[0]?.text ?? "";
    const message = res.error?.message ?? text;
    const rejected = Boolean(res.error) || res.result?.isError === true;
    const bySchema = /-32602|[Ii]nput validation error/.test(message);
    const reachedHandler = /SMTP|credentials/i.test(message);
    check(
      `group rejected before the send path: ${JSON.stringify(group)}`,
      rejected && bySchema && !reachedHandler,
      reachedHandler
        ? "value passed schema validation and reached the mail handler — only the absent credential stopped it"
        : `expected a validation rejection, got ${JSON.stringify(res).slice(0, 180)}`,
    );
  }

  // A legitimate DNS label must still pass validation. With no credentials
  // configured it cannot actually send, and it must say so as an ERROR — the
  // unconfigured path reported isError:false in 1.1.0, which a client that
  // branches on isError reads as a successful publish.
  const ok = await client.request("tools/call", {
    name: "publish_to_web",
    arguments: { subject: "smoke", body: "smoke", group: "team-updates" },
  });
  check(
    "a valid DNS-label group passes schema validation",
    !ok.error,
    `schema rejected a legitimate group: ${JSON.stringify(ok.error ?? {})}`,
  );
  check(
    "unconfigured SMTP is reported as isError",
    ok.result?.isError === true,
    `isError was ${ok.result?.isError}; a client branching on it would read this as a successful publish`,
  );

  // --- resources ---------------------------------------------------------
  const resources = await client.request("resources/list", {});
  const uris = (resources.result?.resources ?? []).map((r) => r.uri);
  check(
    "resources/list advertises abovo://documentation",
    uris.includes("abovo://documentation"),
    `got ${JSON.stringify(uris)}`,
  );

  const doc = await client.request("resources/read", {
    uri: "abovo://documentation",
  });
  const text = doc.result?.contents?.[0]?.text ?? "";
  check("abovo://documentation is readable", text.length > 500, `${text.length} chars`);

  // The tool has no attachment parameter. Documentation that says otherwise is
  // how an agent ends up promising a user something it cannot do.
  const publishSchema = JSON.stringify(
    byName.publish_to_web?.inputSchema ?? {},
  );
  check(
    "publish_to_web genuinely has no attachment parameter",
    !/attach/i.test(publishSchema),
    "the input schema mentions an attachment, so the docs may now be right and this check wrong",
  );
  check(
    "documentation does not claim the tool can attach files",
    !/^\s*-\s*Any file attachment\s*$/m.test(text) ||
      /publish_to_web tool: plain text and HTML only/.test(text),
    "the documentation resource advertises attachments without the tool-level caveat",
  );

  // --- stdout hygiene ----------------------------------------------------
  // Anything written to stdout that is not a JSON-RPC message breaks the
  // transport. Telemetry must go to stderr.
  check(
    "startup telemetry goes to stderr, not stdout",
    /server_init/.test(client.stderr),
    "no server_init line on stderr; if it moved to stdout the transport is corrupted",
  );
} catch (err) {
  failures.push(`threw: ${err.message}`);
} finally {
  client.close();
}

// ---------------------------------------------------------------------------

const width = Math.max(...checks.map((c) => c.name.length), 10);
for (const c of checks) {
  console.log(`${c.ok ? "  ok  " : " FAIL "} ${c.name.padEnd(width)}${c.ok || !c.detail ? "" : "  " + c.detail}`);
}
console.log("");

if (failures.length) {
  console.error(`SMOKE TEST FAILED — ${failures.length} of ${checks.length} checks did not pass:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nDo not cut this release.");
  process.exit(1);
}

console.log(`Smoke test passed: ${checks.length}/${checks.length} checks against ${entry}`);
console.log(`Server reports version ${expectedVersion} and both tools are annotated.`);
process.exit(0);
