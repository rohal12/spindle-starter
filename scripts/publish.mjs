// npm run publish:pages / publish:itch [-- --channel <name>]
//
// Sets the publish target in a way that works in every shell (npm scripts run
// through cmd.exe on Windows, which has no `VAR=value command` syntax), then
// runs the normal Vite build, whose publish plugin does the actual work.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [target, ...rest] = process.argv.slice(2);
if (!["pages", "itch"].includes(target)) {
  console.error("Usage: node scripts/publish.mjs <pages|itch> [--channel <name>]");
  process.exit(1);
}

const env = { ...process.env, SPINDLE_PUBLISH: target, SPINDLE_PACK_TARGETS: "none" };

for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (arg === "--channel" || arg.startsWith("--channel=")) {
    const value = arg.includes("=") ? arg.slice("--channel=".length) : rest[++i];
    if (target !== "itch" || !value) {
      console.error("--channel <name> is only valid for itch and needs a value.");
      process.exit(1);
    }
    env.ITCH_CHANNEL = value;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const result = spawnSync(process.execPath, [viteBin, "build"], { stdio: "inherit", env });
process.exit(result.status ?? 1);
