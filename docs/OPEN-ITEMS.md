# Open items

Known, deliberately-deferred work. Each entry says what is wrong, how it was
verified, what fixing it costs, and who has to press the button. Nothing here is
a mystery — if an item is still listed, it is because someone chose to wait.

Last audited **2026-11-12**.

---

## 1. Hosted tool annotations and copy

**Status: closed 2026-11-12.**

The hosted server at `https://mcp.abovo.co/api/mcp` serves `prepare_abovo_post`
and `get_abovo_info`. Both tools carry a title, `readOnlyHint: true`, and
`destructiveHint: false`. `prepare_abovo_post` sends nothing: it returns To,
Subject, Body, and a mailto link, and `format` defaults to plain text. A group
name that is not a single DNS label is rejected before a mailto is built.

Attachments are files on the email the user sends to `POST@abovo.co`. Code can
be inline in that email or attached as a `.txt` file. Groups are
`{name}@abovo.co`; the creator's "I accept" click makes them the moderator.
Every post's confirmation email includes a delete link.

This pull request brings GitHub main in line with that server and removes the
shared SMTP sender (`publish_to_web`). The already-released 1.1.1 `.mcpb` is
unchanged and still referenced from `.mcp/server.json`.

Verified 2026-11-12 by calling `tools/list` and `tools/call` on the hosted
endpoint. The prepare call returns the mailto and sends nothing.

---

## 2. Registry version 1.1.0 is still `active`, and it ships the unfixed code

**Status: open until Sean runs the registry status workflow after this pull request is merged.**

`https://registry.modelcontextprotocol.io` currently serves two active records
for `io.github.seanfenlon/abovo-mcp-server`:

```
1.1.0   status=active   isLatest=false   remotes=none   pkg=mcpb
1.1.1   status=active   isLatest=true    remotes=none   pkg=mcpb
```

`isLatest` protects the *default* resolution path, not a pinned one. A client
that pins `1.1.0` still gets a working, downloadable, registry-blessed bundle —
and that bundle does not contain the fix.

Verified empirically on 2026-08-01 by downloading the served asset rather than
trusting the tag:

```
https://github.com/seanfenlon/abovo-mcp-server/releases/download/v1.1.0/abovo-mcp-server-1.1.0.mcpb
sha256 7a6d672ea0214417e7a2faac2a09e12f0914e1e1f49a1f6f7a8f4692c0729cb9
  -> manifest.json says version 1.1.0
  -> server/index.cjs does NOT contain "Group name must be a single DNS label"
  -> group is still interpolated straight into `[group]@abovo.co`
```

That is the recipient-injection vector this project was opened to close, still
reachable by anyone who pins the older version.

**Cost to close:** after this pull request is on `main`, run
`.github/workflows/registry-status.yml` (the workflow named **Change a registry
version's status**). It publishes nothing and refuses to deprecate whichever
version the registry marks latest.

1. Open https://github.com/seanfenlon/abovo-mcp-server/actions/workflows/registry-status.yml
2. Click **Run workflow**.
3. Branch: **main**. Version to change: `1.1.0`. New status: **deprecated**. Leave the reason text as it is.
4. Click the green **Run workflow**. Wait for the green check. Verify should print `1.1.0  status=deprecated` and `OK: 1.1.0 is now deprecated`.

Publishing registry 1.2.0 is a later, separate decision. **Cut a release** stops
at its version gate on purpose: the server version is 1.2.0 and the mcpb
package entry is still the already-released 1.1.1 bundle.

**`deprecated` is the right state, not `deleted`** — deprecation keeps the audit
trail and still warns clients, whereas deleting a version that people may
already have installed erases the evidence of what happened.

---

## 3. How to check the live endpoint without a false negative

The obvious probe reports the wrong answer. This server returns argument
validation failures **as an MCP tool error** — `result.isError: true` with the
`-32602` text inside `result.content[0].text` — not as a top-level JSON-RPC
`error` object. Code that inspects `response["error"]` therefore sees nothing,
concludes the call succeeded, and reports the constraint as unenforced when it
is enforced. That exact false negative was hit on 2026-08-01 and caught only by
dumping the raw response.

Read `result.isError` first. Treat the top-level `error` key as one of two
places a rejection can appear, never the only one.

The tool never sends mail. The safe input to probe with is `group="@"`. It is
forbidden by the advertised pattern, so the handler never builds a mailto.
Expected result:

```
result.isError = true
result.content[0].text contains
  "MCP error -32602: Input validation error: ... Group name must be a single DNS label"
```

The advertised pattern should be
`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$`, whose literal hashes to
`bccb281c36b50e8fc55b52b2441f3299e0226974116f33d39ca12150b2d5b902`. Hash the
pattern rather than eyeballing it; a regex is easy to misread and easy to
weaken by one character.

---

## 4. Not this repo: `www.abovo.co` returns stack traces to the public

**Status: reported to SPF 2026-08-01. Cannot be fixed from here.**

`www.abovo.co` is not the Replit host and shares no code with this repository.
It is an ASP.NET MVC 5.2 application on IIS 10 behind Azure App Service
(`Server: Microsoft-IIS/10.0`, `X-AspNetMvc-Version: 5.2`, `ARRAffinity`
cookies). The hosted developer site `https://mcp.abovo.co` serves `/llms.txt`,
`/.well-known/ai-plugin.json` and `/.well-known/mcp.json` correctly with 200s;
`www.abovo.co` does not serve them at all.

Requests to `/.well-known/*` on `www.abovo.co` fall through to an email-render
route and throw `System.ApplicationException`, and the server answers anonymous
callers with a full ASP.NET error page disclosing the exception type, the build
agent's source path, and the controller filename and line number. Detailed
errors are evidently enabled in production.

Fixing it means `<customErrors mode="On">` (or `RemoteOnly`) in that
application's `web.config`, plus a route or static-file handler so
`/.well-known/*` is not swallowed by a controller. That is the FPWeb owner's
change, not this project's. Nothing in this repository advertises
`www.abovo.co/llms.txt`, so no link here is broken by it — every concrete URL
this project publishes was checked on 2026-08-01 and resolves.

---

## 5. Two GitHub PATs are stored in plaintext in Dropbox

**Status: SPF declined revocation on 2026-08-01. Recorded, not escalated.**

`/ABOVO/GH_PAT_abovo-hygiene.txt` and `/ABOVO/abovo-mcp-server push PAT.txt`.
Their values have never been echoed to a transcript, written into this
repository, or placed on a command line. They are live credentials and should be
treated as such by anyone who inherits this work.
