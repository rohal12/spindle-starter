// Replaces the template's IFID in StoryData.twee with a fresh UUID.
// Run it once per story: the IFID must then stay the same across releases,
// because saves are stored under it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const STORY_DATA = "src/story/StoryData.twee";
const TEMPLATE_IFID = "D674C58C-DEFA-4F70-B7A2-27742230C0FC";

if (!existsSync(STORY_DATA)) {
  console.error(`${STORY_DATA} not found. Run this from the project root.`);
  process.exit(1);
}

const source = readFileSync(STORY_DATA, "utf-8");
if (!source.includes(TEMPLATE_IFID)) {
  console.log("StoryData.twee already has its own IFID. Left unchanged.");
} else {
  const ifid = randomUUID().toUpperCase();
  writeFileSync(STORY_DATA, source.replace(TEMPLATE_IFID, ifid));
  console.log(`New IFID: ${ifid}`);
}
