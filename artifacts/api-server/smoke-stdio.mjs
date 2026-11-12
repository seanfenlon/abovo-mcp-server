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
// The server sends nothing. prepare_abovo_post returns a ready-to-send email
// and never opens a mail transport, so this script cannot publish a post.
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
    // Strip every ABOVO_* variable out of the child's environment so a developer's
    // local settings cannot change what this test exercises.
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

  check("tools/list returns prepare_abovo_post", Boolean(byName.prepare_abovo_post));
  check("tools/list returns get_abovo_info", Boolean(byName.get_abovo_info));
  check("tools/list does not return publish_to_web", !byName.publish_to_web);

  // Annotations are how a host decides whether a tool is safe to call without
  // asking. Both tools are read-only: prepare_abovo_post sends nothing.
  for (const name of ["prepare_abovo_post", "get_abovo_info"]) {
    const ann = byName[name]?.annotations;
    check(
      `${name} declares annotations`,
      ann && typeof ann === "object",
      `annotations is ${JSON.stringify(ann)}`,
    );
    check(
      `${name} title is set`,
      typeof ann?.title === "string" && ann.title.length > 0,
      `title is ${JSON.stringify(ann?.title)}`,
    );
    check(
      `${name} is annotated read-only`,
      ann?.readOnlyHint === true,
      `readOnlyHint is ${JSON.stringify(ann?.readOnlyHint)}`,
    );
    check(
      `${name} is annotated not destructive`,
      ann?.destructiveHint === false,
      `destructiveHint is ${JSON.stringify(ann?.destructiveHint)}`,
    );
  }
  check(
    "prepare_abovo_post title is Prepare ABOVO post email",
    byName.prepare_abovo_post?.annotations?.title === "Prepare ABOVO post email",
  );
  check(
    "get_abovo_info title is Get ABOVO info",
    byName.get_abovo_info?.annotations?.title === "Get ABOVO info",
  );

  const prepareSchema = byName.prepare_abovo_post?.inputSchema ?? {};
  const props = prepareSchema.properties ?? {};
  check(
    "prepare format defaults to text",
    props.format?.default === "text",
    `default is ${JSON.stringify(props.format?.default)}`,
  );
  check(
    "prepare body maxLength is 50000",
    props.body?.maxLength === 50000,
    `maxLength is ${JSON.stringify(props.body?.maxLength)}`,
  );
  check(
    "group pattern is a single DNS label",
    props.group?.pattern ===
      "^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$",
    `pattern is ${JSON.stringify(props.group?.pattern)}`,
  );
  check(
    "prepare_abovo_post has no attachment parameter",
    !Object.keys(props).some((k) => /attach/i.test(k)),
    `properties: ${Object.keys(props).join(", ")}`,
  );

  // --- the group parameter must not accept an address list ---------------
  //
  // `group` is placed in the address the user is told to send to. A value that
  // is not a single DNS label could aim that mailto somewhere other than an
  // ABOVO group. Validation must fire before the handler builds a mailto.
  const injectionPayloads = [
    "attacker@example.invalid, jazz",
    "x <attacker@example.invalid>, jazz",
    "jazz@abovo.co",
    "-leading-hyphen",
    "has space",
    "@",
  ];
  for (const group of injectionPayloads) {
    const res = await client.request("tools/call", {
      name: "prepare_abovo_post",
      arguments: { subject: "smoke", body: "smoke", group },
    });
    const text = res.result?.content?.[0]?.text ?? "";
    const message = res.error?.message ?? text;
    const rejected = Boolean(res.error) || res.result?.isError === true;
    const bySchema = /-32602|[Ii]nput validation error/.test(message);
    const reachedHandler = /Nothing has been sent|Mailto link/.test(text);
    check(
      `group rejected before a mailto is built: ${JSON.stringify(group)}`,
      rejected && bySchema && !reachedHandler,
      reachedHandler
        ? "value passed schema validation and the handler built a mailto"
        : `expected a validation rejection, got ${JSON.stringify(res).slice(0, 240)}`,
    );
  }

  // A legitimate DNS label is prepared, not sent. The reply says nothing was
  // sent and names the group address. Omitting format must default to text.
  const prepared = await client.request("tools/call", {
    name: "prepare_abovo_post",
    arguments: { subject: "smoke", body: "smoke body", group: "team-updates" },
  });
  const preparedText = prepared.result?.content?.[0]?.text ?? "";
  check(
    "a valid DNS-label group passes schema validation",
    !prepared.error && prepared.result?.isError !== true,
    `schema rejected a legitimate group: ${JSON.stringify(prepared.error ?? prepared.result ?? {}).slice(0, 240)}`,
  );
  check(
    "prepare returns To the group address and says nothing was sent",
    preparedText.includes("To: team-updates@abovo.co") &&
      preparedText.includes("Nothing has been sent") &&
      preparedText.includes("Format: text") &&
      preparedText.includes("mailto:team-updates@abovo.co?"),
    preparedText.slice(0, 240),
  );

  const personal = await client.request("tools/call", {
    name: "prepare_abovo_post",
    arguments: { subject: "Hello", body: "World" },
  });
  const personalText = personal.result?.content?.[0]?.text ?? "";
  check(
    "prepare without a group addresses POST@abovo.co and sends nothing",
    personal.result?.isError !== true &&
      personalText.includes("To: POST@abovo.co") &&
      personalText.includes("Nothing has been sent") &&
      personalText.includes("mailto:POST@abovo.co?subject=Hello&body=World"),
    personalText.slice(0, 240),
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

  // Attachments are a property of the email the user sends, not of this tool.
  // The docs must say that, and must not claim ABOVO cannot accept them.
  check(
    "documentation tells the user to attach files to the email",
    /attaching files \(images, PDFs, etc\.\) to the email you send/i.test(text),
    "the documentation resource no longer explains email attachments",
  );
  check(
    "documentation explains code inline or as a .txt file",
    /inline in the email body, or attached as a \.txt file/i.test(text),
  );
  check(
    "documentation does not say ABOVO cannot do attachments",
    !/cannot attach|can't do attachments|no attachment parameter|publish_to_web cannot/i.test(
      text,
    ),
    "the documentation resource still describes attachments as unavailable",
  );
  check(
    "documentation explains the delete link and the group accept-click",
    /delete link/i.test(text) && /I accept/.test(text) && /moderator/.test(text),
  );
  check(
    "documentation names the hosted endpoint",
    text.includes("https://mcp.abovo.co/api/mcp"),
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
