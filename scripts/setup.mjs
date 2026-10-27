// Explicit, optional cleanup for a freshly copied starter, before adding
// project documentation. Never invoked by npm's install lifecycle.
import { readFileSync, rmSync, writeFileSync } from "node:fs";

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
rmSync("scripts/dependency-snapshot.mjs", { force: true });
rmSync("test/dependency-snapshot.test.ts", { force: true });
rmSync("CHANGELOG.md", { force: true });
rmSync("UNLICENSE", { force: true });
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Removed starter documentation, template workflows, security policy, license and docs tooling.");
await import("./ifid.mjs");
