// The resolved Cargo tree as a snapshot for GitHub's dependency submission
// API. Cargo.lock is not committed, so the dependency graph would otherwise
// see only the ranges in Cargo.toml: no transitive crate would get Dependabot
// alerts or dependency review. The graph reads the committed npm lockfiles
// itself.
//
//   node scripts/dependency-snapshot.mjs \
//     --cargo pack/tauri/src-tauri/Cargo.toml=cargo-metadata.json > snapshot.json
//
// Each option names a manifest and the output of `cargo metadata
// --format-version 1` for it. The snapshot describes the commit SNAPSHOT_SHA
// (else GITHUB_SHA) and the workflow run in the GITHUB_* variables Actions
// sets. Runs with Node alone. The Gradle tree is submitted by gradle/actions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// crates.io through the git index or the sparse protocol
const CRATES_IO = /^(registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index|sparse\+https:\/\/index\.crates\.io\/)$/;

const RUN_VARIABLES = [
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_WORKFLOW",
  "GITHUB_JOB",
  "GITHUB_RUN_ID",
  "GITHUB_SERVER_URL",
  "GITHUB_REPOSITORY",
];

/**
 * Every crates.io package in `cargo metadata` output, by package URL. Crates
 * the root reaches through normal dependencies are runtime; build-only and
 * dev-only ones are development.
 */
export function cargoResolved(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const urlOf = (id) => {
    const pkg = packages.get(id);
    if (!CRATES_IO.test(pkg?.source ?? "")) return undefined;
    return `pkg:cargo/${pkg.name}@${encodeURIComponent(pkg.version)}`;
  };
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const root = metadata.resolve.root;
  const normal = (dep) => dep.dep_kinds.some((kind) => kind.kind === null);
  const runtime = new Set();
  const pending = [root];
  for (const id of pending) {
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (normal(dep) && !runtime.has(dep.pkg)) {
        runtime.add(dep.pkg);
        pending.push(dep.pkg);
      }
    }
  }
  const direct = new Set((nodes.get(root)?.deps ?? []).map((dep) => dep.pkg));
  const resolved = {};
  for (const node of nodes.values()) {
    const url = urlOf(node.id);
    if (url === undefined) continue;
    resolved[url] = {
      package_url: url,
      relationship: direct.has(node.id) ? "direct" : "indirect",
      scope: runtime.has(node.id) ? "runtime" : "development",
      dependencies: node.deps.flatMap((dep) => urlOf(dep.pkg) ?? []).sort(),
    };
  }
  return resolved;
}

/** The snapshot of `manifests` ({ path: resolved }) from the workflow run `env` describes. */
export function snapshot(manifests, env, scanned) {
  const run = Object.fromEntries(
    RUN_VARIABLES.map((name) => {
      const value = env[name];
      if (!value) throw new Error(`${name} is not set: run this in a workflow`);
      return [name, value];
    }),
  );
  return {
    version: 0,
    sha: env.SNAPSHOT_SHA || run.GITHUB_SHA,
    ref: run.GITHUB_REF,
    job: { correlator: `${run.GITHUB_WORKFLOW} ${run.GITHUB_JOB}`, id: run.GITHUB_RUN_ID },
    detector: {
      name: "spindle-starter dependency-snapshot",
      version: "1",
      url: `${run.GITHUB_SERVER_URL}/${run.GITHUB_REPOSITORY}/blob/main/scripts/dependency-snapshot.mjs`,
    },
    scanned: scanned.toISOString(),
    manifests: Object.fromEntries(
      Object.entries(manifests).map(([path, resolved]) => [
        path,
        { name: path, file: { source_location: path }, resolved },
      ]),
    ),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const manifests = {};
  for (let i = 0; i < args.length; i += 2) {
    const [kind, spec] = [args[i], args[i + 1] ?? ""];
    const [manifest, file] = spec.split("=");
    if (kind !== "--cargo" || !manifest || !file) {
      console.error("Usage: node scripts/dependency-snapshot.mjs --cargo <manifest>=<cargo metadata file>...");
      process.exit(1);
    }
    manifests[manifest] = cargoResolved(JSON.parse(readFileSync(file, "utf-8")));
  }
  process.stdout.write(JSON.stringify(snapshot(manifests, process.env, new Date())));
}
