# Open items

Known, deliberately-deferred work. Each entry says what is wrong, how it was
verified, what fixing it costs, and who has to press the button. Nothing here is
a mystery — if an item is still listed, it is because someone chose to wait.

Last audited **2026-08-01**.

---

## 1. The deployed Replit `/api/mcp` bundle is two commits behind on cosmetics

**Status: deferred by SPF on 2026-08-01, to ride along on his next Replit publish.**

The hosted endpoint is `https://abovo.replit.app/api/mcp`, served from the
ABOVO.co MCP Server Repl (`replId 25bb5529-6d72-4f6d-bde5-39c939074ee1`). Its
deployed bundle predates commit `f014741`, so two accuracy defects are still
live there. Both are already fixed on `main` and both already shipped in the
v1.1.1 `.mcpb` — this is a deployment lag on one host, not an unfixed bug.

| | Observed on the live endpoint |
|---|---|
| `annotations` on `publish_to_web` | **absent** |
| `annotations` on `get_abovo_info` | **absent** |
| `publish_to_web` description | still asserts *"Supports plain text, HTML, and file attachments."* |

The description is the one that actually misleads a model: the MCP tool's input
schema has no attachment field and cannot send one. Attachments work when a
human emails ABOVO.co directly, not through this tool. A model reading that
sentence will believe a capability it does not have. `.well-known/ai-plugin.json`
already states the distinction correctly; the tool description does not.

Neither defect is a security problem. The recipient-injection fix **is** live and
enforced on this endpoint — see §3 for how to prove that without sending mail.

**Cost to close:** one `update_app_using_prompt` to stage the change, then SPF
publishes. Per `s42-replit-connector` §1, staging is automatable and **Publish
never is** — there is no management API for it, permanently. Per §5.7, nothing
is live until SPF publishes, and a Republish redeploys existing code without
picking up pending workspace edits.

---

## 2. Registry version 1.1.0 is still `active`, and it ships the unfixed code

**Status: open. Needs a `workflow_dispatch` run, which needs SPF's browser.**

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

**Cost to close:** `publish-mcp.yml` already carries the machinery — the
`Hide the stale 1.0.0 entry` step calls

```
./mcp-publisher status --status <state> --message "<why>" <name> <version>
```

Today that call is hardcoded to `1.0.0` behind the `purge_stale_v1` input.
Generalising it to accept a version, or adding a second step for `1.1.0`, is a
few lines. **`deprecated` is the right state, not `deleted`** — deprecation
keeps the audit trail and still warns clients, whereas deleting a version that
people may already have installed erases the evidence of what happened.

Editing anything under `.github/workflows/` requires a token with the `workflow`
scope, which the tokens in use do not have; land it through GitHub's web editor
as `99172a9` and `5545aa7` were landed.

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

The safe input to probe with is `group="@"`. It is forbidden by the advertised
pattern *and* `@@abovo.co` is not a deliverable address, so even a total
validation bypass could not send mail to anyone. Expected result:

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
cookies). The Replit developer host `abovo.replit.app` serves `/llms.txt`,
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
