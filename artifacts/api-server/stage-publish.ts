// Stages a publishable copy of the npm package into ./publish-staging.
//
// Why this exists: the development package.json in this folder declares
// pnpm-only version protocols ("workspace:*", "catalog:") and two private
// workspace packages that do not exist on the public npm registry. A tarball
// packed from that manifest is impossible to install with npm (unsupported
// protocol) and unresolvable with any client. npm versions are immutable, so
// publishing it would permanently burn the version number.
//
// The staged package instead ships ONLY the self-contained stdio bundle plus
// docs, with a freshly generated manifest.
//
// IMPORTANT: the generated manifest deliberately contains NO "dependencies",
// NO "devDependencies", and NO "scripts". dist/stdio.cjs is a fully
// self-contained esbuild bundle that runs with an empty node_modules —
// verified by installing the packed tarball into a clean project. Do NOT add
// dependencies back here; doing so would silently break every install.
//
// Usage: tsx ./stage-publish.ts   (run `tsx ./build.ts` first)
// Then publish from the staged folder: cd publish-staging && npm publish

import path from "path";
import { fileURLToPath } from "url";
import { cp, mkdir, readFile, rm, writeFile, access } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const stageDir = path.resolve(__dirname, "publish-staging");
const stdioBundle = path.resolve(__dirname, "dist", "stdio.cjs");

async function stage(): Promise<void> {
  // The stdio bundle must exist before staging; a staged folder without it
  // would be a broken package.
  try {
    await access(stdioBundle);
  } catch {
    console.error(
      "ERROR: dist/stdio.cjs not found. Run the build first:\n" +
        "  pnpm --filter @seanfenlon/abovo-mcp-server run build\n" +
        "then re-run this staging script.",
    );
    process.exit(1);
  }

  // Read and validate BOTH manifests before touching the staging folder, so
  // a validation failure can never leave behind a wiped, half-staged folder
  // that looks publishable but has no manifest in it.
  const devPkg = JSON.parse(
    await readFile(path.resolve(__dirname, "package.json"), "utf-8"),
  );
  const mcpManifest = JSON.parse(
    await readFile(path.join(repoRoot, ".mcp", "server.json"), "utf-8"),
  );

  if (mcpManifest.version !== devPkg.version) {
    console.error(
      `ERROR: version mismatch — .mcp/server.json declares ${mcpManifest.version} ` +
        `but package.json declares ${devPkg.version}. Align the two before staging.`,
    );
    process.exit(1);
  }
  // The registry-type key has been spelled snake_case (schema 2025-07-09) and
  // camelCase (2025-09-16 and later). Accept both, so migrating the schema
  // version of .mcp/server.json can never turn this guard into a silent no-op.
  const npmPackages = (mcpManifest.packages ?? []).filter(
    (p: { registry_type?: string; registryType?: string }) =>
      (p.registryType ?? p.registry_type) === "npm",
  );
  // Zero is legitimate: the canonical distribution channel is the .mcpb bundle
  // attached to a GitHub release (see stage-mcpb.ts), which needs no npm
  // registry account. The tarball this script produces is still useful — it is
  // attached to the same release so `npm install -g <asset URL>` works — so a
  // missing npm entry is not an error. More than one is always a mistake.
  if (npmPackages.length > 1) {
    console.error(
      `ERROR: .mcp/server.json lists ${npmPackages.length} npm package entries; at most one is allowed.`,
    );
    process.exit(1);
  }
  if (npmPackages.length === 1 && npmPackages[0].identifier !== devPkg.name) {
    console.error(
      `ERROR: .mcp/server.json's npm package identifier (${npmPackages[0].identifier}) ` +
        `does not match the package being staged (${devPkg.name}).`,
    );
    process.exit(1);
  }
  if (npmPackages.length === 0) {
    console.log(
      "Note: .mcp/server.json declares no npm package, so the public registry will " +
        "not advertise one. This tarball is for direct install from a release asset:\n" +
        "  npm install -g https://github.com/seanfenlon/abovo-mcp-server/releases/download/" +
        `v${devPkg.version}/seanfenlon-abovo-mcp-server-${devPkg.version}.tgz`,
    );
  }

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(path.join(stageDir, "dist"), { recursive: true });
  await mkdir(path.join(stageDir, ".mcp"), { recursive: true });

  // The bundled stdio entrypoint (self-contained; see header comment).
  await cp(stdioBundle, path.join(stageDir, "dist", "stdio.cjs"));

  // README, LICENSE, and the MCP registry manifest live at the REPOSITORY
  // ROOT, not inside this package folder. Listing them in the dev manifest's
  // "files" array silently matches nothing (npm resolves those paths relative
  // to the package folder), which is how earlier tarballs shipped with no
  // README at all. Copy them in explicitly.
  await cp(path.join(repoRoot, "README.md"), path.join(stageDir, "README.md"));
  await cp(path.join(repoRoot, "LICENSE"), path.join(stageDir, "LICENSE"));
  await cp(
    path.join(repoRoot, ".mcp", "server.json"),
    path.join(stageDir, ".mcp", "server.json"),
  );

  // Build the publish manifest fresh. Name, version, and bin come straight
  // from the development manifest so they can never drift out of sync.
  const publishPkg = {
    name: devPkg.name,
    version: devPkg.version,
    // The public MCP registry proves ownership by downloading the published
    // npm package and checking this field against the name in
    // .mcp/server.json. Read from that file — never hardcoded — so the two
    // can never disagree.
    mcpName: mcpManifest.name,
    description:
      "MCP server for ABOVO.co — publish any content to a permanent public web page by sending an email. No API key, no signup. Runs locally over stdio.",
    license: "MIT",
    author: "Sean P. Fenlon (Abovo42 Corporation)",
    homepage: "https://www.abovo.co",
    repository: {
      type: "git",
      url: "git+https://github.com/seanfenlon/abovo-mcp-server.git",
    },
    bugs: {
      url: "https://github.com/seanfenlon/abovo-mcp-server/issues",
    },
    keywords: [
      "mcp",
      "model-context-protocol",
      "abovo",
      "email",
      "smtp",
      "publishing",
      "stdio",
    ],
    type: "module",
    bin: devPkg.bin,
    engines: { node: ">=18" },
    // Scoped packages are "restricted" by default on npm; without this a
    // publish attempt fails with a payment-required error unless the
    // --access public flag is remembered. Declaring it here means it isn't.
    publishConfig: { access: "public" },
    files: ["dist/", ".mcp/", "README.md", "LICENSE"],
    // NO dependencies / devDependencies / scripts — dist/stdio.cjs is a
    // self-contained bundle. See header comment before changing this.
  };

  await writeFile(
    path.join(stageDir, "package.json"),
    JSON.stringify(publishPkg, null, 2) + "\n",
  );

  console.log(`Staged publishable package at ${stageDir}`);
  console.log("Publish with: cd publish-staging && npm publish");
}

stage().catch((err) => {
  console.error(err);
  process.exit(1);
});
