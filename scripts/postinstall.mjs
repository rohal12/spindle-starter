// Runs after `npm install`. Written in Node so it works wherever npm does,
// including Windows without Bash.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const STORY_DATA = "src/story/StoryData.twee";
const TEMPLATE_IFID = "D674C58C-DEFA-4F70-B7A2-27742230C0FC";

function insideGitWorkTree() {
  // `.git` is a directory in a clone but a file in linked worktrees and submodules
  if (existsSync(".git")) return true;
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return false;
  }
}

function hasTemplateIfid() {
  return existsSync(STORY_DATA) && readFileSync(STORY_DATA, "utf-8").includes(TEMPLATE_IFID);
}

// No Git work tree means a fresh degit copy: this is the one moment the
// template-only files can be removed and the project given its own identity.
// Anything else (clone, worktree, submodule, existing project) is left alone.
if (!insideGitWorkTree()) {
  rmSync("docs", { recursive: true, force: true });
  rmSync(".github/workflows/deploy-docs.yml", { force: true });
  rmSync(".github/workflows/trigger-demo.yml", { force: true });
  rmSync("CHANGELOG.md", { force: true });

  // Remove docs-only dependencies and scripts
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  for (const script of ["docs:dev", "docs:build", "docs:preview"]) {
    delete pkg.scripts?.[script];
  }
  delete pkg.devDependencies?.vitepress;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

  console.log("Cleaned up template-only files (docs, deploy-docs and trigger-demo workflows, changelog).");

  if (hasTemplateIfid()) {
    const ifid = randomUUID().toUpperCase();
    writeFileSync(STORY_DATA, readFileSync(STORY_DATA, "utf-8").replace(TEMPLATE_IFID, ifid));
    console.log(`Generated a new IFID for your story: ${ifid}`);
  }
} else if (hasTemplateIfid()) {
  console.log(
    "Note: src/story/StoryData.twee still has the template's IFID. Stories sharing an IFID\n" +
      "share saves in the browser. Run `npm run ifid` once to give your story its own."
  );
}
