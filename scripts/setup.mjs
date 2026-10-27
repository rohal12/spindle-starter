// Explicit, optional cleanup for a freshly copied starter, before adding
// project documentation. Never invoked by npm's install lifecycle.
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
for (const script of ["docs:dev", "docs:build", "docs:preview"]) {
  delete pkg.scripts?.[script];
}
delete pkg.devDependencies?.vitepress;

rmSync("docs", { recursive: true, force: true });
for (const workflow of ["ci", "codeql", "deploy-docs", "scorecard", "trigger-demo", "zizmor"]) {
  rmSync(`.github/workflows/${workflow}.yml`, { force: true });
}
rmSync(".github/SECURITY.md", { force: true });
rmSync("CHANGELOG.md", { force: true });
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Removed starter documentation, template workflows, security policy and docs tooling.");
await import("./ifid.mjs");
