// Explicit, optional cleanup for a freshly copied starter, before adding
// project documentation. Never invoked by npm's install lifecycle.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
for (const script of ["docs:dev", "docs:build", "docs:preview"]) {
  delete pkg.scripts?.[script];
}
delete pkg.devDependencies?.vitepress;
delete pkg.overrides?.vitepress;
if (pkg.overrides && Object.keys(pkg.overrides).length === 0) delete pkg.overrides;
// The starter's Unlicense is not the story's license
delete pkg.license;

rmSync("docs", { recursive: true, force: true });
for (const workflow of ["ci", "codeql", "dependabot-auto-merge", "dependencies", "deploy-docs", "gradle-wrapper", "pack", "scorecard", "trigger-demo", "zizmor"]) {
  rmSync(`.github/workflows/${workflow}.yml`, { force: true });
}
rmSync(".github/SECURITY.md", { force: true });
rmSync("CHANGELOG.md", { force: true });
rmSync("UNLICENSE", { force: true });
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
// The project keeps the starter's lockfile: drop what package.json no longer
// lists (VitePress and its tree, the overrides, the license) so the two stay
// in step. Only package-lock.json is written: nothing is installed or run.
if (existsSync("package-lock.json")) {
  execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", { stdio: "inherit" });
}
console.log("Removed starter documentation, template workflows, security policy, license and docs tooling.");
await import("./ifid.mjs");
