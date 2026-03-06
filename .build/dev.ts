import { build } from "vite";
import { resolve } from "path";
import browserSync from "browser-sync";
import { watch as tweeWatch } from "@rohal12/twee-ts";
import fs from "fs";

// Colors for console output
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(prefix: string, color: string, msg: string) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`${c.dim}${time}${c.reset} ${color}[${prefix}]${c.reset} ${msg}`);
}

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

async function dev() {
  const cwd = process.cwd();

  // Initial Vite asset build
  log("dev", c.blue, "Building...");
  try {
    await build({ configFile: "./vite.config.ts", logLevel: "warn" });
  } catch (e) {
    log("dev", c.magenta, "Initial build failed, starting server anyway...");
  }

  // Ensure dist directory exists
  if (!fs.existsSync(resolve(cwd, "dist"))) fs.mkdirSync(resolve(cwd, "dist"));

  // Start browser-sync
  const bs = browserSync.create();

  const rebuildAssets = debounce(() => {
    bs.reload();
  }, 100);

  // Start twee-ts incremental watcher
  const tweeAbort = await tweeWatch({
    sources: ["src/story"],
    outFile: "dist/index.html",
    formatPaths: [resolve(cwd, "storyformats")],
    modules: ["dist/styles/app.bundle.css", "dist/scripts/app.bundle.js"],
    headFile: "src/head-content.html",
    testMode: true,
    onBuild: (result) => {
      log(
        "spindle",
        c.green,
        `Story compiled. (${result.stats.passages} passages, ${result.stats.words} words)`,
      );
      bs.reload();
    },
    onError: (error) => {
      log("spindle", c.magenta, `Build failed:\n${error.message}`);
    },
  });

  await new Promise<void>((resolve) => {
    bs.init(
      {
        server: "./dist",
        port: 4321,
        open: true,
        notify: false,
        ui: false,
        logLevel: "silent",
        files: [
          // CSS injection (no full reload)
          {
            match: "dist/**/*.css",
            fn: (_event: string, _file: string) => bs.reload("*.css"),
          },
        ],
      },
      () => {
        log("server", c.green, "http://localhost:4321");
        resolve();
      },
    );
  });

  // Watch JS/CSS with Vite
  log("vite", c.magenta, "Watching assets...\n");
  await build({
    configFile: "./vite.config.ts",
    build: { watch: {}, emptyOutDir: false },
    logLevel: "warn",
    plugins: [
      {
        name: "reload-on-build",
        closeBundle() {
          rebuildAssets();
        },
      },
    ],
  });

  // Graceful shutdown
  const cleanup = () => {
    log("dev", c.blue, "Shutting down...");
    tweeAbort.abort();
    bs.exit();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

dev().catch(console.error);
