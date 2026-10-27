// The resolved npm and Cargo trees as one snapshot for GitHub's dependency
// submission API. The starter commits no lockfiles, so the dependency graph
// would otherwise see only the ranges in package.json and Cargo.toml: no
// transitive package would get Dependabot alerts or dependency review.
//
//   node scripts/dependency-snapshot.mjs \
//     --npm package.json=package-lock.json \
//     --cargo pack/tauri/src-tauri/Cargo.toml=cargo-metadata.json > snapshot.json
//
// Each option names a manifest and the file resolved from it: a package-lock.json
// written by `npm install --package-lock-only`, or the output of `cargo metadata
// --format-version 1`. The snapshot describes the commit SNAPSHOT_SHA (else
// GITHUB_SHA) and the workflow run in the GITHUB_* variables Actions sets.
// Runs with Node alone. The Gradle tree is submitted by gradle/actions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A version from a registry; a link:, file: or git dependency has none
const REGISTRY_VERSION = /^[\w.+-]+$/;
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

/** The package URL of an npm registry package, or undefined for any other. */
export function npmPackageUrl(name, version) {
  if (!REGISTRY_VERSION.test(version ?? "")) return undefined;
  return `pkg:npm/${name.replace(/^@/, "%40")}@${encodeURIComponent(version)}`;
}

// "node_modules/a/node_modules/@s/b" -> "@s/b"
function nameAt(location) {
  return location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);
}

// Where Node finds `name` from the package at `location`: its own
// node_modules, then each enclosing one up to the project's
function resolveFrom(packages, location, name) {
  let base = location;
  for (;;) {
    const candidate = `${base ? `${base}/` : ""}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return undefined;
    const parent = base.lastIndexOf("/node_modules/");
    base = parent === -1 ? "" : base.slice(0, parent);
  }
}

/**
 * Every registry package in a package-lock.json (lockfileVersion 2 or 3), by
 * package URL. npm's own `dev` flag decides the scope.
 */
export function npmResolved(lock) {
  const packages = lock.packages ?? {};
  const root = packages[""] ?? {};
  const directNames = new Set(
    [root.dependencies, root.devDependencies, root.optionalDependencies].flatMap((group) => Object.keys(group ?? {})),
  );
  const resolved = {};
  for (const [location, pkg] of Object.entries(packages)) {
    if (!location || pkg.link) continue;
    const name = pkg.name ?? nameAt(location);
    const url = npmPackageUrl(name, pkg.version);
    if (url === undefined) continue;
    const dependencies = new Set(resolved[url]?.dependencies ?? []);
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      const target = resolveFrom(packages, location, dependency);
      const targetUrl = target && npmPackageUrl(packages[target].name ?? dependency, packages[target].version);
      if (targetUrl) dependencies.add(targetUrl);
    }
    const direct = location === `node_modules/${name}` && directNames.has(name);
    // One version installed in several places is development only if it is everywhere
    const development = pkg.dev === true && (resolved[url]?.scope ?? "development") === "development";
    resolved[url] = {
      package_url: url,
      relationship: direct || resolved[url]?.relationship === "direct" ? "direct" : "indirect",
      scope: development ? "development" : "runtime",
      dependencies: [...dependencies].sort(),
    };
  }
  return resolved;
}

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
    if (!["--npm", "--cargo"].includes(kind) || !manifest || !file) {
      console.error("Usage: node scripts/dependency-snapshot.mjs (--npm|--cargo) <manifest>=<resolved file>...");
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(file, "utf-8"));
    manifests[manifest] = kind === "--npm" ? npmResolved(data) : cargoResolved(data);
  }
  process.stdout.write(JSON.stringify(snapshot(manifests, process.env, new Date())));
}
