import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { cpSync, existsSync } from "fs";
import { compileToFile } from "@rohal12/twee-ts";
import { spindlePublish } from "./publish/plugin.js";

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
        await compileToFile({
          // The CSS bundle goes in as a story stylesheet so Spindle applies it
          // after its own styles; as a <head> module it would load first and
          // lose to the format's rules (e.g. body font-family). It's listed
          // first so its @imports stay at the top and stylesheet passages
          // can still override it.
          sources: ["dist/styles/app.bundle.css", "src/story"],
          outFile: "dist/index.html",
          formatPaths: [resolve(import.meta.dirname!, "node_modules/@rohal12/spindle/dist")],
          modules: ["dist/scripts/app.bundle.js"],
          headFile: "src/head-content.html",
          testMode: process.env.NODE_ENV !== "production",
        });
        console.log("[spindle] Story compiled.\n");
      },
    },
  };
}

// Copy src/assets/media/ to dist/media/ so stories and head content can use
// "media/..." URLs. (Vite's publicDir would copy the files to the dist/ root.)
function mediaPlugin(): Plugin {
  const src = resolve(import.meta.dirname!, "src/assets/media");
  return {
    name: "vite-plugin-spindle-media",
    apply: "build",
    writeBundle() {
      if (existsSync(src)) {
        cpSync(src, resolve(import.meta.dirname!, "dist/media"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: false,

  build: {
    outDir: "dist",
    emptyOutDir: !process.argv.includes("--watch"),
    sourcemap: process.env.NODE_ENV !== "production",
    rollupOptions: {
      input: resolve(import.meta.dirname!, "src/assets/app/index.ts"),
      output: {
        entryFileNames: "scripts/app.bundle.js",
        chunkFileNames: "scripts/[name]-[hash].js",
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
