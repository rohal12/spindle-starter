// Runs after `npm install`. Written in Node so it works wherever npm does,
// including Windows without Bash.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// An install can happen repeatedly, including in projects without Git. It
// must never delete project files. Template cleanup is an explicit setup step.
if (!insideGitWorkTree()) {
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
