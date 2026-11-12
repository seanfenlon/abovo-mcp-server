// Rewrites the version in every place it is written by hand.
//
// The server version lives in SERVER_VERSION, package.json, and the top-level
// version of .mcp/server.json. Those three move together. The mcpb package
// entry (identifier, package version, fileSha256) stays pinned to the bundle
// that was actually released — 1.2.0 keeps the 1.1.1 artifact — so this script
// does not rewrite it. A new bundle is a separate release, written by
// stage-mcpb.ts --update-manifest once the package entry is meant to move.
// The README names that released bundle on purpose and is not rewritten here.
//
// Every replacement below is asserted. If a pattern stops matching — because
// the README was reworded, or a file moved — this exits non-zero rather than
// quietly bumping three of four files and leaving the fourth pointing at the
// previous release. Silent partial rewrites are how the "files" array in the
// dev manifest ended up matching nothing and shipping tarballs with no README.
//
// Usage:  node ./bump-version.mjs 1.1.1
//         node ./bump-version.mjs 1.1.1 --dry-run
//
// After bumping, .mcp/server.json's fileSha256 is deliberately left stale: the
// hash of an artifact that does not exist yet cannot be known. Run
//   tsx ./build.ts && tsx ./stage-mcpb.ts --update-manifest
// to build the artifact and write its real hash in. The release workflow does
// exactly that, so in the normal flow this is handled for you.

import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const next = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!next || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error(
    "Usage: node ./bump-version.mjs <semver> [--dry-run]\n" +
      "       e.g. node ./bump-version.mjs 1.1.1",
  );
  process.exit(1);
}

const pkgPath = path.join(__dirname, "package.json");
const current = JSON.parse(await readFile(pkgPath, "utf-8")).version;

if (current === next) {
  console.error(`ERROR: package.json is already at ${next}. Nothing to do.`);
  process.exit(1);
}

// A version must only ever move forward. npm versions are immutable and a
// GitHub release tag is effectively so; re-releasing a number that has already
// shipped means two different artifacts answer to one identifier.
const cmp = (a, b) => {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
if (cmp(next, current) < 0) {
  console.error(
    `ERROR: ${next} is lower than the current ${current}. Released versions are ` +
      "immutable; pick a higher number.",
  );
  process.exit(1);
}

/** Each edit declares what it expects to find, so a miss is an error. */
const edits = [
  {
    file: path.join(__dirname, "src", "lib", "version.ts"),
    label: "SERVER_VERSION (reported to MCP clients in the handshake)",
    find: new RegExp(
      `(export const SERVER_VERSION = ")${escapeRe(current)}(")`,
    ),
    replace: `$1${next}$2`,
    expect: 1,
  },
  {
    file: pkgPath,
    label: "api-server package.json version",
    find: new RegExp(`("version":\\s*")${escapeRe(current)}(")`),
    replace: `$1${next}$2`,
    expect: 1,
  },
  {
    file: path.join(repoRoot, ".mcp", "server.json"),
    label:
      "registry manifest top-level version (the mcpb package entry stays pinned)",
    // Only the top-level "version" field. A global replace would also rewrite
    // the pinned package identifier the next time the two versions coincide.
    find: new RegExp(
      `("version":\\s*")${escapeRe(current)}("\\s*,\\s*\\n\\s*"websiteUrl")`,
    ),
    replace: `$1${next}$2`,
    expect: 1,
  },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let failed = false;
const results = [];

for (const edit of edits) {
  const before = await readFile(edit.file, "utf-8");
  const matches = before.match(edit.find);
  const count = matches ? (edit.find.global ? matches.length : 1) : 0;

  if (count !== edit.expect) {
    failed = true;
    results.push({
      rel: path.relative(repoRoot, edit.file),
      label: edit.label,
      status: `EXPECTED ${edit.expect} occurrence(s) of ${current}, FOUND ${count}`,
    });
    continue;
  }

  const after = before.replace(edit.find, edit.replace);
  if (!dryRun) await writeFile(edit.file, after);
  results.push({
    rel: path.relative(repoRoot, edit.file),
    label: edit.label,
    status: `${count} occurrence(s) ${dryRun ? "would be" : ""} updated`,
  });
}

const w = Math.max(...results.map((r) => r.rel.length));
for (const r of results) {
  console.log(`${r.rel.padEnd(w)}  ${r.status}`);
  console.log(`${" ".repeat(w)}  ${r.label}`);
}
console.log("");

if (failed) {
  console.error(
    `ERROR: nothing was written. At least one file did not contain the expected\n` +
      `number of "${current}" occurrences, which means either the version is\n` +
      "already partly bumped or a file was reworded and this script needs updating.\n" +
      "Bumping the rest would leave the repository advertising two versions at once.",
  );
  process.exit(1);
}

console.log(
  `${dryRun ? "[dry run] " : ""}${current} -> ${next} across ${edits.length} files.`,
);
console.log(
  "\nThe mcpb package entry was left untouched. It keeps pointing at the bundle\n" +
    "that was actually released. Do not run stage-mcpb.ts --update-manifest\n" +
    "unless you are cutting that new bundle: the script refuses while the\n" +
    "package entry version and the server version still differ.",
);
