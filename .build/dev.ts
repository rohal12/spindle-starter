import { build } from "vite";
import { resolve } from "path";
import browserSync from "browser-sync";
import { watch as tweeWatch } from "@rohal12/twee-ts";
import fs from "fs";
import { reportDiagnostics } from "./diagnostics.js";
import { watchMedia } from "./media.js";

// Vite's build() sets NODE_ENV to "production" when it is unset, which would
// disable test mode, sourcemaps and unminified CSS for every rebuild below.
process.env.NODE_ENV ??= "development";

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

// The author stylesheet (CSS bundle + stylesheet passages) is inlined in
// index.html, so browser-sync has no linked stylesheet to inject. A build whose
// HTML differs only in this element is applied in place instead of reloading.
const STYLESHEET = /<style role="stylesheet" id="twine-user-stylesheet"[^>]*>[\s\S]*?<\/style>/;

function splitStylesheet(html: string): { rest: string; style: string } {
  return { rest: html.replace(STYLESHEET, ""), style: html.match(STYLESHEET)?.[0] ?? "" };
}

// Runs in the player (injected by browser-sync, dev only). On a "spindle:css"
// message it fetches the rebuilt page and swaps the stylesheet Spindle applied
// at startup, so JS and DOM state survive. If anything looks off it reloads.
const CSS_UPDATER = `<script>(function () {
  function stylesheetOf(html) {
    var el = new DOMParser().parseFromString(html, "text/html")
      .querySelector('style[role="stylesheet"]');
    return el ? el.textContent : null;
  }
  function fetchStylesheet() {
    return fetch(location.href, { cache: "no-store" })
      .then(function (r) { return r.text(); }).then(stylesheetOf);
  }
  // Read the page actually loaded, rather than fetching a possibly newer build.
  var source = document.querySelector('style[role="stylesheet"]');
  var current = source ? source.textContent : null;
  var applied = null;
  function apply() {
    fetchStylesheet().then(function (next) {
      if (next === null || current === null) return location.reload();
      if (!applied && current !== "") {
        applied = Array.prototype.find.call(
          document.head.querySelectorAll("style"),
          function (s) { return !s.id && s.textContent === current; }
        );
      }
      // Spindle skips author-style creation when CSS is initially empty.
      // Append after its built-in styles, and retain the element across clears.
      if (!applied && current === "") {
        applied = document.createElement("style");
        document.head.appendChild(applied);
      }
      if (!applied) return location.reload();
      applied.textContent = next;
      current = next;
    });
  }
  var timer = setInterval(function () {
    var bs = window.___browserSync___;
    if (!bs || !bs.socket) return;
    clearInterval(timer);
    bs.socket.on("spindle:css", apply);
  }, 50);
})();</script>`;

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

  // Last good build, so a rebuild can tell what changed. The compiler writes
  // every build, errors or not, so it writes to a scratch file and only a
  // build without errors replaces dist/index.html.
  const scratch = resolve(cwd, "node_modules/.cache/spindle-dev/index.html");
  fs.mkdirSync(resolve(scratch, ".."), { recursive: true });
  let lastHtml = fs.existsSync(resolve(cwd, "dist/index.html"))
    ? fs.readFileSync(resolve(cwd, "dist/index.html"), "utf-8")
    : "";

  // Start twee-ts incremental watcher
  const tweeAbort = await tweeWatch({
    // CSS as a story stylesheet, so it applies after Spindle's styles (see vite.config.ts)
    sources: ["dist/styles/app.bundle.css", "src/story"],
    outFile: scratch,
    formatPaths: [resolve(cwd, "node_modules/@rohal12/spindle/dist")],
    modules: ["dist/scripts/app.bundle.js"],
    headFile: "src/head-content.html",
    testMode: true,
    onBuild: (result) => {
      const errors = reportDiagnostics(result.diagnostics);
      if (errors.length > 0) {
        log(
          "spindle",
          c.magenta,
          `Story has ${errors.length} error(s); keeping the last good build.`,
        );
        return;
      }

      log(
        "spindle",
        c.green,
        `Story compiled. (${result.stats.passages} passages, ${result.stats.words} words)`,
      );

      const next = result.output;
      if (next === lastHtml) return;
      const before = splitStylesheet(lastHtml);
      const after = splitStylesheet(next);
      lastHtml = next;
      fs.writeFileSync(resolve(cwd, "dist/index.html"), next);

      if (before.rest === after.rest && before.style !== "") {
        (bs as any).sockets.emit("spindle:css");
      } else {
        bs.reload();
      }
    },
    onError: (error) => {
      log("spindle", c.magenta, `Build failed:\n${error.message}`);
    },
  });

  await new Promise<void>((resolve, reject) => {
    bs.init(
      {
        server: "./dist",
        port: 4321,
        open: true,
        notify: false,
        ui: false,
        logLevel: "silent",
        rewriteRules: [
          { match: /<\/body>/i, fn: (_req: unknown, _res: unknown, match: string) => CSS_UPDATER + match },
        ],
      },
      (error) => {
        if (error) return reject(error);
        log("server", c.green, bs.getOption("urls").get("local"));
        resolve();
      },
    );
  });

  // Mirror src/assets/media/ into dist/media/ (adds, changes and removals)
  const stopMediaWatch = watchMedia(cwd, () => {
    log("media", c.yellow, "Media updated.");
    bs.reload();
  });

  // Watch JS/CSS with Vite. The story compiler watches the built bundles, so
  // rebuilds reach the browser through its onBuild above.
  log("vite", c.magenta, "Watching assets...\n");
  await build({
    configFile: "./vite.config.ts",
    build: { watch: {}, emptyOutDir: false },
    logLevel: "warn",
  });

  // Graceful shutdown
  const cleanup = () => {
    log("dev", c.blue, "Shutting down...");
    tweeAbort.abort();
    stopMediaWatch();
    bs.exit();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

dev().catch(console.error);
