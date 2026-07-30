// Builds a distributable MCP Bundle (.mcpb) from the self-contained stdio bundle.
//
// Why this exists: the public MCP Registry proves ownership of an
// `io.github.<user>/*` server name through GitHub authentication alone. For an
// `mcpb` package entry it needs three things and nothing more — a registry_type
// of "mcpb", an identifier URL pointing at a GitHub (or GitLab) release asset
// whose path contains "mcp", and the artifact's SHA-256. No npm account, no npm
// registry, no Docker registry is involved at any point.
//
// The artifact itself is a plain ZIP with manifest.json at the archive root.
// dist/stdio.cjs is a fully self-contained esbuild bundle, so the archive needs
// no node_modules and no package.json.
//
// IMPORTANT — every optional user_config key MUST declare a `default`.
// The host substitutes ${user_config.<key>} only for keys present in the merged
// config map, which is built from manifest defaults plus user-supplied values.
// An optional key with no default and no user value is left in the environment
// as the LITERAL string "${user_config.<key>}", which is truthy and therefore
// defeats the server's own `||` fallbacks. Empty-string defaults keep those
// fallbacks working.
//
// Usage: tsx ./build.ts && tsx ./stage-mcpb.ts [--update-manifest]
//
// Without the flag the script cross-checks .mcp/server.json against the
// artifact and fails if they disagree. With it, it repairs .mcp/server.json in
// place — see the comment above the check for why that flag has to exist.

import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, cp, mkdir, readFile, rm, writeFile } from "fs/promises";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const stdioBundle = path.resolve(__dirname, "dist", "stdio.cjs");
const workDir = path.resolve(__dirname, "mcpb-staging");
const payloadDir = path.join(workDir, "payload");

async function build(): Promise<void> {
  try {
    await access(stdioBundle);
  } catch {
    console.error(
      "ERROR: dist/stdio.cjs not found. Run the build first:\n" +
        "  pnpm --filter @seanfenlon/abovo-mcp-server run build\n" +
        "then re-run this script.",
    );
    process.exit(1);
  }

  // Read and validate before touching the staging folder, so a failure can
  // never leave behind a half-built bundle that looks shippable.
  const devPkg = JSON.parse(
    await readFile(path.resolve(__dirname, "package.json"), "utf-8"),
  );
  const mcpManifest = JSON.parse(
    await readFile(path.join(repoRoot, ".mcp", "server.json"), "utf-8"),
  );

  if (mcpManifest.version !== devPkg.version) {
    console.error(
      `ERROR: version mismatch — .mcp/server.json declares ${mcpManifest.version} ` +
        `but package.json declares ${devPkg.version}. Align the two before building.`,
    );
    process.exit(1);
  }

  // The registry requires "mcp" to appear in the asset URL path. The asset name
  // is derived here rather than typed twice, so the name in the release and the
  // name the manifest advertises cannot drift apart.
  const assetName = `abovo-mcp-server-${devPkg.version}.mcpb`;
  if (!assetName.toLowerCase().includes("mcp")) {
    console.error(
      `ERROR: asset name "${assetName}" does not contain "mcp"; the registry ` +
        "rejects mcpb identifiers whose URL path lacks it.",
    );
    process.exit(1);
  }

  const manifest = {
    manifest_version: "0.3",
    name: "abovo-mcp-server",
    display_name: "ABOVO.co — Email-to-Web Publishing",
    version: devPkg.version,
    description:
      "Publish any content to a permanent public web page by sending an email. No API key, no signup. SMTP is the API.",
    long_description:
      "ABOVO.co turns email into a publishing API. Send any message to POST@abovo.co and it becomes a permanent public web page; send to [groupname]@abovo.co to post to a group. This extension exposes that capability to Claude as two tools — publish_to_web and get_abovo_info — and runs entirely on your own machine over stdio. It sends through your own mailbox using credentials you supply below; nothing is proxied through a third-party service. Relates to U.S. Patent No. 10,404,634 B2.",
    author: {
      name: "Sean P. Fenlon (Abovo42 Corporation)",
      email: "info@abovo.co",
      url: "https://www.abovo.co",
    },
    repository: {
      type: "git",
      url: "https://github.com/seanfenlon/abovo-mcp-server",
    },
    homepage: "https://www.abovo.co",
    documentation: "https://www.abovo.co/home/help",
    support: "https://github.com/seanfenlon/abovo-mcp-server/issues",
    license: "MIT",
    keywords: [
      "mcp",
      "model-context-protocol",
      "abovo",
      "email",
      "smtp",
      "publishing",
      "stdio",
    ],
    server: {
      type: "node",
      entry_point: "server/index.cjs",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.cjs"],
        env: {
          ABOVO_SMTP_USER: "${user_config.smtp_user}",
          ABOVO_SMTP_PASS: "${user_config.smtp_pass}",
          ABOVO_SMTP_HOST: "${user_config.smtp_host}",
          ABOVO_SMTP_PORT: "${user_config.smtp_port}",
          ABOVO_SENDER_EMAIL: "${user_config.sender_email}",
        },
      },
    },
    tools: [
      {
        name: "publish_to_web",
        description:
          "Publish a subject and body to ABOVO.co as a permanent public web page, optionally to a group",
      },
      {
        name: "get_abovo_info",
        description:
          "Return information about ABOVO.co capabilities, URL formats, groups, or use cases",
      },
    ],
    user_config: {
      smtp_user: {
        type: "string",
        title: "Your email address",
        description:
          "The mailbox this extension sends from. Posts are published under this address on ABOVO.co.",
        required: true,
      },
      smtp_pass: {
        type: "string",
        title: "Email password or app password",
        description:
          "Stored by your operating system's credential store, never written to disk in plain text. For Gmail, create an App Password rather than using your account password.",
        sensitive: true,
        required: true,
      },
      smtp_host: {
        type: "string",
        title: "SMTP host",
        description:
          "Leave as-is for Gmail. Change only if you send through a different provider.",
        default: "smtp.gmail.com",
        required: false,
      },
      smtp_port: {
        type: "number",
        title: "SMTP port",
        description:
          "587 for STARTTLS (the usual choice) or 465 for implicit TLS.",
        default: 587,
        min: 1,
        max: 65535,
        required: false,
      },
      // Optional, so it MUST carry a default — see the header comment. An empty
      // string lets the server fall back to the address above.
      sender_email: {
        type: "string",
        title: "From address (optional)",
        description:
          "Leave blank to send as the email address above. Set this only if your provider requires a different envelope sender.",
        default: "",
        required: false,
      },
    },
    compatibility: {
      claude_desktop: ">=0.10.0",
      platforms: ["darwin", "win32", "linux"],
      runtimes: { node: ">=18.0.0" },
    },
    privacy_policies: [],
  };

  await rm(workDir, { recursive: true, force: true });
  await mkdir(path.join(payloadDir, "server"), { recursive: true });

  await writeFile(
    path.join(payloadDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await cp(stdioBundle, path.join(payloadDir, "server", "index.cjs"));
  await cp(
    path.join(repoRoot, "README.md"),
    path.join(payloadDir, "README.md"),
  );
  await cp(path.join(repoRoot, "LICENSE"), path.join(payloadDir, "LICENSE"));

  const outPath = path.join(workDir, assetName);

  // The archive must be byte-reproducible. The SHA-256 recorded in
  // .mcp/server.json has to match the asset actually attached to the release,
  // and MCP clients refuse to install when it doesn't — so a build that
  // produced a different hash every run would leave the manifest permanently
  // one rebuild away from being wrong. Three sources of nondeterminism are
  // removed here:
  //   fixed mtimes  — ZIP stores a DOS timestamp per entry; 1980-01-01 is the
  //                   earliest the format can represent.
  //   fixed modes   — ZIP stores unix permissions in the external-attributes
  //                   field, so the builder's umask would otherwise leak into
  //                   the hash. Measured: a build under `umask 077` produced a
  //                   completely different archive. 0644 for every entry; the
  //                   entrypoint is launched as `node <file>`, never executed
  //                   directly, so it needs no exec bit.
  //   -D            — omit directory entries entirely.
  //   sorted list   — explicit file order instead of filesystem walk order.
  //   -X            — drop uid/gid and extended-timestamp extra fields.
  //   TZ=UTC        — the DOS timestamp is written in local time.
  // Residual: deflate output could in principle differ across zlib builds, so
  // the authoritative hash is always the one taken from the uploaded file.
  const entries = [
    "LICENSE",
    "README.md",
    "manifest.json",
    "server/index.cjs",
  ].sort();
  const absEntries = entries.map((e) => path.join(payloadDir, e));
  await execFileAsync("chmod", ["644", ...absEntries], { cwd: payloadDir });
  await execFileAsync("touch", ["-t", "198001010000", ...absEntries], {
    cwd: payloadDir,
  });
  await execFileAsync("zip", ["-q", "-X", "-D", "-9", outPath, ...entries], {
    cwd: payloadDir,
    env: { ...process.env, TZ: "UTC" },
  });

  const bytes = await readFile(outPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const releaseTag = `v${devPkg.version}`;
  const identifier =
    "https://github.com/seanfenlon/abovo-mcp-server/releases/download/" +
    `${releaseTag}/${assetName}`;

  // Emitted in the camelCase spelling of schema 2025-10-17, which is what
  // .mcp/server.json declares. If that file is ever moved back to a snake_case
  // schema, this must move with it.
  await writeFile(
    path.join(workDir, "package-entry.json"),
    JSON.stringify(
      {
        registryType: "mcpb",
        registryBaseUrl: "https://github.com",
        identifier,
        version: devPkg.version,
        fileSha256: sha256,
        transport: { type: "stdio" },
      },
      null,
      2,
    ) + "\n",
  );

  // Fail loudly if the manifest already carries an mcpb entry that disagrees
  // with what was just built. A stale sha256 is the single most likely way to
  // ship a bundle that every client refuses to install.
  //
  // --update-manifest repairs the disagreement in place instead of failing.
  // That flag exists so the 64-character hash is written mechanically: it never
  // has to be read off a terminal and retyped, and it never has to travel
  // anywhere as prose. Transcription is the one step in this pipeline where a
  // single wrong character silently breaks every install, and it is the step a
  // machine should own.
  const updateManifest = process.argv.slice(2).includes("--update-manifest");

  const declared = (mcpManifest.packages ?? []).find(
    (p: { registryType?: string; registry_type?: string }) =>
      (p.registryType ?? p.registry_type) === "mcpb",
  ) as
    | {
        identifier?: string;
        version?: string;
        fileSha256?: string;
        file_sha256?: string;
      }
    | undefined;

  if (!declared) {
    if (updateManifest) {
      console.error(
        "ERROR: --update-manifest was given, but .mcp/server.json has no package " +
          'entry whose registryType is "mcpb". Copy mcpb-staging/package-entry.json ' +
          "into its packages array first, then re-run.",
      );
      process.exit(1);
    }
    console.log(
      "Note: .mcp/server.json declares no mcpb package, so nothing was cross-checked.",
    );
  } else if (updateManifest) {
    const declaredSha = declared.fileSha256 ?? declared.file_sha256;
    const changes: string[] = [];
    if (declared.identifier !== identifier) {
      changes.push(`identifier  -> ${identifier}`);
      declared.identifier = identifier;
    }
    if (declaredSha !== sha256) {
      // Write into whichever spelling the file already uses, so a snake_case
      // manifest never ends up carrying both spellings of the same field.
      if ("file_sha256" in declared) {
        changes.push(`file_sha256 -> ${sha256}`);
        declared.file_sha256 = sha256;
      } else {
        changes.push(`fileSha256  -> ${sha256}`);
        declared.fileSha256 = sha256;
      }
    }
    if (declared.version !== undefined && declared.version !== devPkg.version) {
      changes.push(`version     -> ${devPkg.version}`);
      declared.version = devPkg.version;
    }
    if (changes.length) {
      await writeFile(
        path.join(repoRoot, ".mcp", "server.json"),
        JSON.stringify(mcpManifest, null, 2) + "\n",
      );
      console.log("Updated   .mcp/server.json to match this artifact:");
      for (const c of changes) console.log(`            ${c}`);
    } else {
      console.log(
        "Verified  .mcp/server.json already matched this artifact exactly; nothing to update.",
      );
    }
  } else {
    const declaredSha = declared.fileSha256 ?? declared.file_sha256;
    const problems: string[] = [];
    if (declared.identifier !== identifier) {
      problems.push(
        `  identifier: manifest says ${declared.identifier}\n              build says ${identifier}`,
      );
    }
    if (declaredSha !== sha256) {
      problems.push(
        `  sha256:     manifest says ${declaredSha}\n              build says ${sha256}`,
      );
    }
    if (problems.length) {
      console.error(
        "ERROR: .mcp/server.json's mcpb entry does not match the artifact just built:\n" +
          problems.join("\n") +
          "\nRe-run with --update-manifest to write the built values in, or copy " +
          "mcpb-staging/package-entry.json in by hand.",
      );
      process.exit(1);
    }
    console.log("Verified  .mcp/server.json matches this artifact exactly.");
  }

  console.log(`Built     ${outPath}`);
  console.log(`Size      ${bytes.length} bytes`);
  console.log(`SHA-256   ${sha256}`);
  console.log(`Tag       ${releaseTag}`);
  console.log(`Identifier ${identifier}`);
  console.log(
    "\nNext: create the GitHub release at the tag above and attach the .mcpb as\n" +
      "an asset under exactly that filename — the identifier is a literal URL, so\n" +
      "a renamed asset is a 404. Then re-download the uploaded asset and confirm\n" +
      "its SHA-256 still reads as above; clients refuse to install on a mismatch,\n" +
      "and the hash of the file that is actually being served is the only one that\n" +
      "counts.\n" +
      "\nIf the manifest needs the built values written in, re-run with\n" +
      "--update-manifest rather than retyping the hash.",
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
