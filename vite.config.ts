import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { compile } from "@rohal12/twee-ts";
import { spindlePublish } from "./publish/plugin.js";
import { reportDiagnostics } from "./.build/diagnostics.js";
import { syncMedia } from "./.build/media.js";

// To enable single-file executable packaging, uncomment and configure:
//
// import { spindlePack } from './pack/plugin.js';
//
// Then add to the plugins array (AFTER spindlePlugin()):
//
// spindlePack({
//   name: 'My Story',
//   identifier: 'com.author.mystory',
//   icon: 'src/assets/media/icon.png', // falls back to favicon.svg if missing
//   version: '1.0.0',
//   targets: ['windows', 'macos', 'linux', 'android', 'joiplay'],
// })

function spindlePlugin(): Plugin {
  return {
    name: "vite-plugin-spindle",
    // closeBundle hooks run in parallel by default. Compile the story first and
    // make later plugins (publish, pack) wait until dist/index.html exists.
    closeBundle: {
      order: "pre",
      sequential: true,
      async handler() {
        const result = await compile({
          // The CSS bundle goes in as a story stylesheet so Spindle applies it
          // after its own styles; as a <head> module it would load first and
          // lose to the format's rules (e.g. body font-family). It's listed
          // first so its @imports stay at the top and stylesheet passages
          // can still override it.
          sources: ["dist/styles/app.bundle.css", "src/story"],
          formatPaths: [resolve(import.meta.dirname!, "node_modules/@rohal12/spindle/dist")],
          modules: ["dist/scripts/app.bundle.js"],
          headFile: "src/head-content.html",
          testMode: process.env.NODE_ENV !== "production",
        });

        // compile() resolves even when the story is broken (for example the
        // start passage in StoryData does not exist and the compiler falls
        // back to another one), so the diagnostics have to be checked.
        const errors = reportDiagnostics(result.diagnostics);
        if (errors.length > 0 && process.env.NODE_ENV === "production") {
          throw new Error(
            `[spindle] The story has ${errors.length} error(s); not writing dist/index.html.`,
          );
        }

        mkdirSync(resolve(import.meta.dirname!, "dist"), { recursive: true });
        writeFileSync(resolve(import.meta.dirname!, "dist/index.html"), result.output);
        console.log(
          errors.length > 0
            ? "[spindle] Story compiled with errors.\n"
            : "[spindle] Story compiled.\n",
        );
      },
    },
  };
}

// Copy src/assets/media/ to dist/media/ (see .build/media.ts)
function mediaPlugin(): Plugin {
  return {
    name: "vite-plugin-spindle-media",
    apply: "build",
    writeBundle() {
      syncMedia(import.meta.dirname!);
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: false,

  build: {
    outDir: "dist",
    // With an iife bundle Vite would inject CSS from JS at runtime; a single
    // extracted file is what the story compiler takes as a stylesheet.
    cssCodeSplit: false,
    emptyOutDir: !process.argv.includes("--watch"),
    // The bundle is inlined into index.html, so an external map could never be
    // found next to it: embed the map instead.
    sourcemap: process.env.NODE_ENV !== "production" ? "inline" : false,
    rollupOptions: {
      input: resolve(import.meta.dirname!, "src/assets/app/index.ts"),
      output: {
        // The bundle ends up in a classic inline <script>, where import,
        // import.meta and chunk URLs don't work: emit one self-contained
        // script and fold dynamic import()s into it.
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "scripts/app.bundle.js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";
          if (name.endsWith(".css")) return "styles/app.bundle.css";
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name))
            return "fonts/[name][extname]";
          return "assets/[name][extname]";
        },
      },
    },
  },

  css: { devSourcemap: true },
  // Emit asset URLs (fonts, images referenced from SCSS) relative to
  // index.html. The CSS is inlined there, so Vite's default absolute
  // "/fonts/..." would break on GitHub Pages project sites and file://.
  // As a result dist/styles/app.bundle.css only works inlined: loaded on its
  // own, its url(fonts/...) would resolve against dist/styles/.
  experimental: { renderBuiltUrl: (filename) => filename },
  preview: { port: 4321 },

  plugins: [
    mediaPlugin(),
    spindlePlugin(),
    // Activated via SPINDLE_PUBLISH env var (see publish:pages / publish:itch scripts)
    spindlePublish({
      // itch: { user: 'myname', game: 'my-story' },
    }),
  ],
});
