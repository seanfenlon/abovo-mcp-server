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
  const devPkg = JSON.parse(
    await readFile(path.resolve(__dirname, "package.json"), "utf-8"),
  );

  const publishPkg = {
    name: devPkg.name,
    version: devPkg.version,
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
