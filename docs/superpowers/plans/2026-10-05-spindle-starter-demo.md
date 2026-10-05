# Spindle Starter Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public demo repo, `rohal12/spindle-starter-demo`, whose CI assembles spindle-starter at a given ref, adds a small demo story, and then lints, builds, packs every target, deploys a playable web demo and attaches binaries to releases. spindle-starter triggers it on `main` pushes and releases.

**Architecture:** The demo repo holds only an `overlay/` directory and scripts. `scripts/assemble.sh <ref> <dir>` fetches spindle-starter at `<ref>` without `.git` (like degit), replaces `src/story/` and copies the overlay on top. `overlay/vite.demo.config.ts` extends the starter's own `vite.config.ts` with `spindlePack`, so the template's real build pipeline is what gets tested. A single workflow, `build.yml`, runs plan → web (+ Pages deploy) → pack matrix → release. spindle-starter gets a `trigger-demo.yml` that sends a `repository_dispatch`.

**Tech Stack:** Bash, GitHub Actions, Vite 7, twee-ts, Spindle 0.51, spindle-lsp, Tauri 2, Capacitor 7, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-05-spindle-starter-demo-design.md`

## Global Constraints

- spindle-starter's defaults stay unchanged: `spindlePack` remains opt-in and `npm run build` behaves as today.
- The demo always builds against an explicit spindle-starter ref (branch, tag or SHA). It never contains a copy of the template.
- Starter PRs are not gated by the demo. Triggers: starter `main` push, starter release, manual dispatch, demo `main` push.
- Nothing demo-specific reaches users who degit the template (postinstall removes `trigger-demo.yml`).
- Demo identifier `com.rohal12.spindledemo`, name `Spindle Demo`, Pages URL `https://rohal12.github.io/spindle-starter-demo/`.
- Starter dispatch secret: `DEMO_DISPATCH_TOKEN`, a fine-grained PAT scoped to `rohal12/spindle-starter-demo` with Contents read/write. The repo owner creates it.
- Event types: `starter-main` (payload `ref` = SHA) and `starter-release` (payload `ref` = tag).
- Action versions: checkout@v7, setup-node@v7 (Node 22), setup-java@v6 (Temurin 21), upload-artifact@v7, download-artifact@v8, upload-pages-artifact@v5, deploy-pages@v5, android-actions/setup-android@v4, dtolnay/rust-toolchain@stable, Swatinem/rust-cache@v2.
- Local paths: starter at `/media/clemens/storage/git/twine/spindle-starter` (branch `demo-project`), demo at `/media/clemens/storage/git/twine/spindle-starter-demo`.

## Review Focus

1. **Starter ref is a commit SHA.** `starter-main` dispatches send `github.sha`, and `git clone --branch` can't check out a SHA. `assemble.sh` must fetch SHAs as well as branches and tags. Pinned by the SHA case in Task 1's test.
2. **Re-running a release for a tag whose demo release already exists**, e.g. a re-dispatched or retried run. Expected: assets are replaced (`--clobber`), not a failed job. Pinned in Task 7, step 5.
3. **`DEMO_DISPATCH_TOKEN` not set** (before setup, or in a fork). Expected: `trigger-demo.yml` logs a notice and succeeds instead of failing every push. Pinned in Task 6, step 4.
4. **Release tags that aren't exactly `vX.Y.Z`**, e.g. `2.3.0`, `v2.3.0-beta.1`, or junk like `main`. Expected: the version passed to Tauri is valid semver, and junk falls back to `0.0.0`. Pinned by Task 3's test.
5. **`repository_dispatch` without `client_payload.ref`** (a manual API call). Expected: builds starter `main` instead of failing on an empty ref. Pinned in Task 7, step 4.

---

## File Structure

**New repo `spindle-starter-demo/`:**

| File | Responsibility |
|---|---|
| `scripts/assemble.sh` | Build a project dir from starter@ref + overlay |
| `scripts/demo-version.sh` | Map a ref to a semver version for builds |
| `scripts/check-dist.sh` | Assert a built `dist/` contains everything the demo exercises |
| `tests/assemble.test.sh`, `tests/demo-version.test.sh`, `tests/check-dist.test.sh` | Bash tests for the scripts |
| `tests/lib.sh` | Shared tiny assert helpers for the bash tests |
| `overlay/src/story/*.twee` | Demo story |
| `overlay/src/assets/app/index.ts`, `demo.ts`, `styles/index.scss` | Demo script and theme |
| `overlay/src/assets/media/banner.svg`, `icon.png` | Passage image and app icon |
| `overlay/src/assets/fonts/lora-latin-400-normal.woff2`, `OFL.txt` | Custom font and its license |
| `overlay/vite.demo.config.ts` | Starter config + `spindlePack` |
| `.github/workflows/build.yml` | CI: plan, web, deploy, pack, release |
| `README.md`, `.gitignore` | Docs and ignores |

**spindle-starter (branch `demo-project`):**

| File | Change |
|---|---|
| `vite.config.ts` | Relative built asset URLs (`renderBuiltUrl`), so fonts and images work on Pages subpaths and `file://` |
| `.github/workflows/trigger-demo.yml` | New: dispatch to the demo repo |
| `.github/workflows/build-{android,desktop,joiplay}.yml` | Skip jobs in the template repo itself |
| `scripts/postinstall.sh` | Also remove `trigger-demo.yml` on degit |
| `readme.md`, `docs/index.md` | Link the demo |
| `CHANGELOG.md` | Unreleased entries |

---

### Task 1: Demo repo skeleton and `assemble.sh`

**Files:**
- Create: `spindle-starter-demo/.gitignore`, `scripts/assemble.sh`, `tests/lib.sh`, `tests/assemble.test.sh`, `overlay/src/story/Start.twee` (placeholder, replaced in Task 2)

**Interfaces:**
- Produces: `scripts/assemble.sh <ref> <dir>`. Exits 0 and leaves a buildable project in `<dir>`; exits 1 with `error: ...` on stderr if `<dir>` is non-empty or `<ref>` can't be fetched. The `STARTER_REPO` env var overrides the source URL (default `https://github.com/rohal12/spindle-starter.git`).
- Produces: `tests/lib.sh` with `assert_file <path>`, `assert_no_file <path>`, `assert_grep <pattern> <file-or-dir>`, `assert_no_grep <pattern> <file-or-dir>`, `assert_eq <expected> <actual> <label>`, `assert_fails <label> <cmd...>`, `finish`.

- [ ] **Step 1: Create the repo and test helpers**

```bash
mkdir -p /media/clemens/storage/git/twine/spindle-starter-demo/{scripts,tests,overlay/src/story}
cd /media/clemens/storage/git/twine/spindle-starter-demo && git init -q -b main
cat > .gitignore <<'EOF'
node_modules/
work/
.tools/
EOF
```

`tests/lib.sh`:

```bash
# Minimal assertion helpers for bash tests. Source this file.
failures=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; failures=$((failures + 1)); }
assert_file()    { [ -e "$1" ] && pass "exists: $1" || fail "missing: $1"; }
assert_no_file() { [ ! -e "$1" ] && pass "absent: $1" || fail "should not exist: $1"; }
assert_grep()    { grep -rq -- "$1" "$2" && pass "'$1' in $2" || fail "'$1' not found in $2"; }
assert_no_grep() { ! grep -rq -- "$1" "$2" && pass "'$1' not in $2" || fail "'$1' unexpectedly in $2"; }
assert_eq()      { [ "$1" = "$2" ] && pass "$3" || fail "$3: expected '$1', got '$2'"; }
assert_fails()   { local label="$1"; shift; if "$@" >/dev/null 2>&1; then fail "$label (succeeded)"; else pass "$label"; fi; }
finish() { if [ "$failures" -gt 0 ]; then echo "$failures failure(s)"; exit 1; fi; echo "all passed"; }
```

Placeholder overlay story, so the assemble test can check that the overlay replaced the starter's story (Task 2 replaces it):

```bash
printf ':: StoryTitle\nSpindle Demo\n\n:: Start\nPlaceholder.\n' > overlay/src/story/Start.twee
```

- [ ] **Step 2: Write the failing test**

`tests/assemble.test.sh`:

```bash
#!/usr/bin/env bash
# Integration test: needs network access to github.com.
set -uo pipefail
cd "$(dirname "$0")/.."
. tests/lib.sh

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
sha="$(git ls-remote https://github.com/rohal12/spindle-starter.git refs/heads/main | cut -f1)"

for ref in main v2.2.0 "$sha"; do
  echo "ref: $ref"
  dir="$tmp/$ref"
  if scripts/assemble.sh "$ref" "$dir" >/dev/null; then pass "assemble $ref"; else fail "assemble $ref"; continue; fi
  assert_file "$dir/package.json"
  assert_file "$dir/vite.config.ts"
  assert_no_file "$dir/.git"
  # Overlay replaced the starter story: title comes from the overlay, and nothing
  # from the starter's story survives (its text and its IFID are gone)
  assert_grep "Spindle Demo" "$dir/src/story/Start.twee"
  assert_no_grep "Hello World" "$dir/src/story"
  assert_no_grep "D674C58C-DEFA-4F70-B7A2-27742230C0FC" "$dir/src/story"
done

echo "errors"
mkdir -p "$tmp/nonempty" && touch "$tmp/nonempty/x"
assert_fails "rejects non-empty dir" scripts/assemble.sh main "$tmp/nonempty"
assert_fails "rejects unknown ref" scripts/assemble.sh no-such-ref-xyz "$tmp/bad"
assert_fails "requires args" scripts/assemble.sh

finish
```

```bash
chmod +x tests/assemble.test.sh
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `tests/assemble.test.sh`
Expected: FAIL lines for `assemble main` etc. (`scripts/assemble.sh: No such file or directory`), exit code 1.

- [ ] **Step 4: Implement `scripts/assemble.sh`**

```bash
#!/usr/bin/env bash
# Assemble a buildable demo project: spindle-starter at <ref> (without .git,
# like `npx degit`) with this repo's overlay/ copied on top.
#
# Usage: scripts/assemble.sh <ref> <dir>
#   <ref>  spindle-starter branch, tag or commit SHA
#   <dir>  output directory (must be empty or not exist)
set -euo pipefail

ref="${1:?usage: assemble.sh <ref> <dir>}"
dir="${2:?usage: assemble.sh <ref> <dir>}"
repo="${STARTER_REPO:-https://github.com/rohal12/spindle-starter.git}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -e "$dir" ] && [ -n "$(ls -A "$dir")" ]; then
  echo "error: $dir is not empty" >&2
  exit 1
fi
mkdir -p "$dir"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# fetch (rather than clone --branch) also accepts commit SHAs
git -C "$tmp" init -q
git -C "$tmp" remote add origin "$repo"
if ! git -C "$tmp" fetch -q --depth 1 origin "$ref"; then
  echo "error: could not fetch '$ref' from $repo" >&2
  exit 1
fi
git -C "$tmp" archive FETCH_HEAD | tar -x -C "$dir"

# The demo story replaces the starter's hello-world passages entirely
rm -rf "$dir/src/story"
cp -R "$root/overlay/." "$dir/"

echo "Assembled spindle-starter@$ref + overlay in $dir"
```

```bash
chmod +x scripts/assemble.sh
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `tests/assemble.test.sh`
Expected: all `ok`, ending with `all passed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: assemble demo project from spindle-starter ref + overlay"
```

---

### Task 2: `check-dist.sh` and the demo overlay

**Files:**
- Create: `scripts/check-dist.sh`, `tests/check-dist.test.sh`
- Create: `overlay/src/story/{StoryData,StoryVariables,StoryInterface,Start,Library,Dice,About}.twee` (replace the Task 1 placeholder `Start.twee`)
- Create: `overlay/src/assets/app/index.ts`, `overlay/src/assets/app/demo.ts`, `overlay/src/assets/app/styles/index.scss`
- Create: `overlay/src/assets/media/banner.svg`, `overlay/src/assets/media/icon.png`
- Create: `overlay/src/assets/fonts/lora-latin-400-normal.woff2`, `overlay/src/assets/fonts/OFL.txt`

**Interfaces:**
- Consumes: `scripts/assemble.sh` (Task 1), `tests/lib.sh` (Task 1).
- Produces: `scripts/check-dist.sh <project-dir>`. Exits 0 when `<project-dir>/dist` contains the demo's web build; exits 1 and lists every failed check otherwise.
- Produces: `window.demo.rollDice(sides: number): number`, used by the `Dice` passage.

- [ ] **Step 1: Write `check-dist.sh`, the test that defines a correct web build**

`scripts/check-dist.sh`:

```bash
#!/usr/bin/env bash
# Check that <project>/dist is a complete web build of the demo story.
# Usage: scripts/check-dist.sh <project-dir>
set -uo pipefail
dist="${1:?usage: check-dist.sh <project-dir>}/dist"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$root/tests/lib.sh"

html="$dist/index.html"
assert_file "$html"
# Story compiled with the overlay's passages
assert_grep "Spindle Demo" "$html"
for passage in Start Library Dice About StoryVariables StoryInterface; do
  assert_grep "name=\"$passage\"" "$html"
done
# Script and styles were bundled and inlined
assert_grep "rollDice" "$html"
assert_grep "font-family:\"Lora\"\|font-family: \"Lora\"\|font-family:Lora" "$html"
# Media copied to dist/media, font emitted to dist/fonts
assert_file "$dist/media/banner.svg"
assert_file "$dist/media/icon.png"
assert_file "$dist/fonts/lora-latin-400-normal.woff2"
# Asset URLs must be relative so the demo works on a Pages subpath and under file://
assert_grep "url(fonts/lora-latin-400-normal.woff2)" "$html"
assert_no_grep "url(/" "$html"
# A web build must not contain packaging output
assert_no_file "$dist/pack"

finish
```

`tests/check-dist.test.sh`:

```bash
#!/usr/bin/env bash
# check-dist.sh must reject an incomplete build.
set -uo pipefail
cd "$(dirname "$0")/.."
. tests/lib.sh
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/empty/dist"
assert_fails "rejects empty dist" scripts/check-dist.sh "$tmp/empty"

mkdir -p "$tmp/abs/dist/media" "$tmp/abs/dist/fonts"
printf '<title>Spindle Demo</title>rollDice url(/fonts/lora-latin-400-normal.woff2)' > "$tmp/abs/dist/index.html"
assert_fails "rejects absolute asset URLs" scripts/check-dist.sh "$tmp/abs"

finish
```

```bash
chmod +x scripts/check-dist.sh tests/check-dist.test.sh
tests/check-dist.test.sh
```

Expected: `all passed` (both bad builds rejected).

- [ ] **Step 2: Run `check-dist.sh` against the current state to see it fail**

```bash
rm -rf work && scripts/assemble.sh main work && (cd work && npm install --no-audit --no-fund && NODE_ENV=production npm run build)
scripts/check-dist.sh work
```

Expected: FAIL for the passages `Library`/`Dice`/`About`, `rollDice`, Lora, `banner.svg`, `icon.png`, the font, and the relative-URL check. Exit code 1.

- [ ] **Step 3: Write the story**

Overwrite the placeholder `overlay/src/story/Start.twee`:

```txt
:: StoryTitle
Spindle Demo

:: Start
<img class="banner" src="media/banner.svg" alt="Spindle Demo" />

Welcome, {$name}. This little story is built from the latest
spindle-starter to show what the template produces, and to test its
builds on every platform.

[[Visit the library->Library]]
[[Roll a die->Dice]]
[[About this demo->About]]
```

`overlay/src/story/Library.twee`:

```txt
:: Library
{set $visits = $visits + 1}
Dusty shelves stretch into the dark. You have visited the library {$visits} time(s).

Saves remember this count: try the save and load buttons in the menu bar.

[[Back to the entrance->Start]]
```

`overlay/src/story/Dice.twee`:

```txt
:: Dice
{do}
  Story.set("lastRoll", window.demo.rollDice(6));
{/do}
You rolled a {$lastRoll}.

[[Roll again->Dice]]
[[Back to the entrance->Start]]
```

`overlay/src/story/About.twee`:

```txt
:: About
This demo is assembled from
<a href="https://github.com/rohal12/spindle-starter">spindle-starter</a>
plus a small overlay of passages, a font (Lora), an image and a script.
Its source lives at
<a href="https://github.com/rohal12/spindle-starter-demo">spindle-starter-demo</a>.

[[Back to the entrance->Start]]
```

`overlay/src/story/StoryVariables.twee`:

```txt
:: StoryVariables
$name = "Traveller"
$visits = 0
$lastRoll = 0
```

`overlay/src/story/StoryInterface.twee` (same as the starter's default):

```txt
:: StoryInterface
<header class="story-menubar">
  {story-title}{back}{forward}{restart}{quicksave}{quickload}{saves}{settings}
</header>
{passage}
```

`overlay/src/story/StoryData.twee`:

```txt
:: StoryData
{
	"ifid": "A4FFB844-B244-4522-A67A-99DA0952F6B9",
	"format": "spindle",
	"format-version": "0.51.0"
}
```

- [ ] **Step 4: Write the script and styles**

`overlay/src/assets/app/index.ts`:

```ts
import "./styles/index.scss";
import "./demo";
```

`overlay/src/assets/app/demo.ts`:

```ts
// Exposed on window so passages can call it from {do} blocks.
function rollDice(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

declare global {
  interface Window {
    demo: { rollDice: typeof rollDice };
  }
}

window.demo = { rollDice };

export {};
```

`overlay/src/assets/app/styles/index.scss`:

```scss
@font-face {
  font-family: "Lora";
  src: url("../../fonts/lora-latin-400-normal.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

* {
  box-sizing: border-box;
}

body {
  font-family: "Lora", Georgia, serif;
  background: #faf7f2;
  color: #2b2118;
}

.banner {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto 1.5rem;
}
```

- [ ] **Step 5: Add the media and font**

`overlay/src/assets/media/banner.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 160" width="600" height="160">
  <rect width="600" height="160" rx="12" fill="#5b21b6"/>
  <text x="300" y="95" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="#f5f3ff">Spindle Demo</text>
</svg>
```

Render `icon.png` (1024×1024) from the starter's favicon:

```bash
tmp="$(mktemp -d)" && npm install --prefix "$tmp" --no-save --no-audit --no-fund @resvg/resvg-js >/dev/null
NODE_PATH="$tmp/node_modules" node -e '
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const png = new Resvg(fs.readFileSync(process.argv[1]), { fitTo: { mode: "width", value: 1024 } }).render().asPng();
fs.writeFileSync(process.argv[2], png);
' work/src/assets/media/favicon.svg overlay/src/assets/media/icon.png
file overlay/src/assets/media/icon.png
```

Expected: `PNG image data, 1024 x 1024`.

Download the font and its license:

```bash
curl -fsSL -o overlay/src/assets/fonts/lora-latin-400-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/lora@5/files/lora-latin-400-normal.woff2
curl -fsSL -o overlay/src/assets/fonts/OFL.txt https://cdn.jsdelivr.net/npm/@fontsource/lora@5/LICENSE
head -1 overlay/src/assets/fonts/OFL.txt
```

Expected: the first line starts with `Copyright 2011 The Lora Project Authors`.

- [ ] **Step 6: Assemble, lint, typecheck and build**

```bash
rm -rf work && scripts/assemble.sh main work
cd work && npm install --no-audit --no-fund && npm run lint && npx tsc --noEmit -p . && NODE_ENV=production npm run build && cd ..
scripts/check-dist.sh work
```

Expected:
- `npm run lint` prints `No problems found`.
- `tsc` is silent.
- `check-dist.sh` passes everything **except** `url(fonts/lora-latin-400-normal.woff2)` and `url(/` not in index.html. Starter `main` still emits `url(/fonts/...)`; Task 4 fixes that in the starter.

If `npm run lint` reports an error for `window.demo` in `Dice.twee`, the linter doesn't know about globals added by scripts. Check `npx spindle-lsp --help` and the spindle-lsp config (`--config`) for a way to declare the global and add that config to `overlay/`. If there is none, report it to the user as a spindle-lsp limitation and stop; don't weaken the demo.

- [ ] **Step 7: Smoke-test the story in a browser**

```bash
cd work && npx vite preview --port 4321 --strictPort &
```

Using Playwright, open `http://localhost:4321/` and check:
- The banner image loads (`naturalWidth > 0`).
- `document.fonts.check('16px Lora')` is `true`.
- Clicking "Roll a die" shows `You rolled a N` with N between 1 and 6.
- Clicking "Visit the library" twice (via "Back to the entrance") shows `visited the library 2 time(s)`.
- There are no console errors.

Stop the preview server afterwards (`kill %1`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: demo story overlay and dist checks"
```

---

### Task 3: `demo-version.sh` and the pack config

**Files:**
- Create: `scripts/demo-version.sh`, `tests/demo-version.test.sh`, `overlay/vite.demo.config.ts`

**Interfaces:**
- Produces: `scripts/demo-version.sh <ref>` prints a semver version: `v1.2.3` → `1.2.3`, `1.2.3` → `1.2.3`, `v1.2.3-beta.1` → `1.2.3-beta.1`, anything else → `0.0.0`.
- Produces: `overlay/vite.demo.config.ts`, the starter config plus `spindlePack`. Build with `npx vite build -c vite.demo.config.ts`. It reads `DEMO_VERSION` (default `0.0.0`) and is controlled by `SPINDLE_PACK_TARGETS`.

- [ ] **Step 1: Write the failing test**

`tests/demo-version.test.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
. tests/lib.sh

check() { assert_eq "$2" "$(scripts/demo-version.sh "$1" 2>/dev/null)" "demo-version $1"; }
check v2.2.0 2.2.0
check 2.3.0 2.3.0
check v2.3.0-beta.1 2.3.0-beta.1
check v10.20.30 10.20.30
check main 0.0.0
check 3192943a1b2c3d4e5f60718293a4b5c6d7e8f901 0.0.0
check v2.2 0.0.0
check "v2.2.0; rm -rf /" 0.0.0
check "" 0.0.0

finish
```

```bash
chmod +x tests/demo-version.test.sh && tests/demo-version.test.sh
```

Expected: FAIL for every case (`No such file or directory`).

- [ ] **Step 2: Implement `scripts/demo-version.sh`**

```bash
#!/usr/bin/env bash
# Print the semver version for a starter ref: release tags (v1.2.3, 1.2.3,
# v1.2.3-beta.1) map to their version, anything else to 0.0.0.
# Usage: scripts/demo-version.sh <ref>
set -euo pipefail
ref="${1:-}"
if [[ "$ref" =~ ^v?([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)$ ]]; then
  echo "${BASH_REMATCH[1]}"
else
  echo "0.0.0"
fi
```

```bash
chmod +x scripts/demo-version.sh && tests/demo-version.test.sh
```

Expected: `all passed`.

- [ ] **Step 3: Add the pack config**

`overlay/vite.demo.config.ts`:

```ts
// Starter config + spindlePack. Extends the starter's own vite.config.ts so
// the template's real pipeline is what gets tested.
// Build with: npx vite build -c vite.demo.config.ts
// Pick targets with SPINDLE_PACK_TARGETS (e.g. joiplay); none are built by default.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config.js";
import { spindlePack } from "./pack/plugin.js";

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      spindlePack({
        name: "Spindle Demo",
        identifier: "com.rohal12.spindledemo",
        icon: "src/assets/media/icon.png",
        version: process.env.DEMO_VERSION || "0.0.0",
        targets: [],
      }),
    ],
  }),
);
```

- [ ] **Step 4: Verify a pack build locally (JoiPlay needs no toolchain)**

```bash
rm -rf work && scripts/assemble.sh main work && cd work && npm install --no-audit --no-fund
NODE_ENV=production DEMO_VERSION=$(../scripts/demo-version.sh v2.2.0) SPINDLE_PACK_TARGETS=joiplay npx vite build -c vite.demo.config.ts
ls dist/pack/joiplay/ && unzip -l dist/pack/joiplay/Spindle-Demo-joiplay.zip | grep -E "index.html|media/banner.svg|fonts/lora"
NODE_ENV=production npx vite build -c vite.demo.config.ts && ls dist
cd ..
```

Expected: `Spindle-Demo-joiplay.zip` containing `index.html`, `media/banner.svg` and the font. The second build (no `SPINDLE_PACK_TARGETS`) leaves no `dist/pack`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: demo pack config and version mapping"
```

---

### Task 4: Starter fix: relative built asset URLs

Task 2 showed that the starter emits `url(/fonts/...)`. The CSS is inlined into `index.html` at the site root, so absolute URLs break on GitHub Pages project sites (`/<repo>/`) and under JoiPlay's `file://`.

**Files (spindle-starter, branch `demo-project`):**
- Modify: `vite.config.ts` (the `defineConfig` object)
- Modify: `CHANGELOG.md` (add an `## Unreleased` section at the top)

**Interfaces:**
- Consumes: `spindle-starter-demo/scripts/check-dist.sh` (Task 2) as the test.

- [ ] **Step 1: Confirm the failing check against the starter branch**

```bash
cd /media/clemens/storage/git/twine/spindle-starter && git switch demo-project && git push -u origin demo-project
cd ../spindle-starter-demo && rm -rf work && scripts/assemble.sh demo-project work && (cd work && npm install --no-audit --no-fund && NODE_ENV=production npm run build) ; scripts/check-dist.sh work
```

Expected: FAIL only for the two URL checks.

- [ ] **Step 2: Implement**

In `spindle-starter/vite.config.ts`, add after `css: { devSourcemap: true },`:

```ts
  // Emit asset URLs (fonts, images referenced from SCSS) relative to
  // index.html. The CSS is inlined there, so Vite's default absolute
  // "/fonts/..." would break on GitHub Pages project sites and file://.
  experimental: { renderBuiltUrl: (filename) => filename },
```

In `CHANGELOG.md`, insert above `## 2.2.0`:

```md
## Unreleased

- Fix fonts and images referenced from SCSS using absolute `/...` URLs, which broke on GitHub Pages project sites and JoiPlay
```

- [ ] **Step 3: Verify**

```bash
cd /media/clemens/storage/git/twine/spindle-starter && npm run build && grep -c "url(/" dist/index.html
git commit -am "fix: emit relative asset URLs so fonts/images work on subpaths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
cd ../spindle-starter-demo && rm -rf work && scripts/assemble.sh demo-project work && (cd work && npm install --no-audit --no-fund && NODE_ENV=production npm run build) && scripts/check-dist.sh work
```

Expected: `grep -c` prints `0`, and `check-dist.sh` ends with `all passed`.

---

### Task 5: Demo workflow `build.yml` and README

**Files:**
- Create: `spindle-starter-demo/.github/workflows/build.yml`, `spindle-starter-demo/README.md`

**Interfaces:**
- Consumes: `scripts/assemble.sh`, `scripts/demo-version.sh`, `scripts/check-dist.sh`, `overlay/vite.demo.config.ts`.
- Produces: `repository_dispatch` types `starter-main` and `starter-release` with `client_payload.ref`; `workflow_dispatch` input `ref`. Artifacts are named `pack-<target>`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/build.yml`:

```yaml
name: Build demo

on:
  repository_dispatch:
    types: [starter-main, starter-release]
  workflow_dispatch:
    inputs:
      ref:
        description: spindle-starter ref to build (branch, tag or SHA)
        default: main
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: demo-${{ github.event.action || github.event_name }}-${{ github.event.client_payload.ref || inputs.ref || 'main' }}
  cancel-in-progress: ${{ github.event.action != 'starter-release' }}

defaults:
  run:
    shell: bash

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      ref: ${{ steps.plan.outputs.ref }}
      version: ${{ steps.plan.outputs.version }}
      deploy: ${{ steps.plan.outputs.deploy }}
      release: ${{ steps.plan.outputs.release }}
    steps:
      - uses: actions/checkout@v7
      - id: plan
        env:
          EVENT: ${{ github.event_name }}
          ACTION: ${{ github.event.action }}
          PAYLOAD_REF: ${{ github.event.client_payload.ref }}
          INPUT_REF: ${{ inputs.ref }}
        run: |
          ref="${PAYLOAD_REF:-${INPUT_REF:-main}}"
          deploy=false
          release=false
          case "$EVENT/$ACTION" in
            repository_dispatch/starter-main | push/*) deploy=true ;;
            repository_dispatch/starter-release) deploy=true; release=true ;;
          esac
          {
            echo "ref=$ref"
            echo "version=$(scripts/demo-version.sh "$ref")"
            echo "deploy=$deploy"
            echo "release=$release"
          } | tee -a "$GITHUB_OUTPUT"

  web:
    needs: plan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: scripts/assemble.sh "${{ needs.plan.outputs.ref }}" work
      - run: npm install --no-audit --no-fund
        working-directory: work
      - run: npm run lint
        working-directory: work
      - run: npx tsc --noEmit -p .
        working-directory: work
      - run: npm run build
        working-directory: work
        env:
          NODE_ENV: production
          SPINDLE_PACK_TARGETS: none
      - run: scripts/check-dist.sh work
      - uses: actions/upload-pages-artifact@v5
        with:
          path: work/dist

  deploy:
    needs: [plan, web]
    if: needs.plan.outputs.deploy == 'true'
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5

  pack:
    needs: plan
    strategy:
      fail-fast: false
      matrix:
        include:
          - { target: windows, os: windows-latest }
          - { target: macos, os: macos-latest }
          - { target: linux, os: ubuntu-latest }
          - { target: android, os: ubuntu-latest }
          - { target: joiplay, os: ubuntu-latest }
    runs-on: ${{ matrix.os }}
    # Optional Android signing: without these secrets the APK is a debug build
    env:
      KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      # Desktop (Tauri): mirrors spindle-starter's build-desktop.yml
      - if: contains(fromJSON('["windows","macos","linux"]'), matrix.target)
        uses: dtolnay/rust-toolchain@stable
      - if: matrix.target == 'linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      # Android (Capacitor): mirrors spindle-starter's build-android.yml
      - if: matrix.target == 'android'
        uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: 21
      - if: matrix.target == 'android'
        uses: android-actions/setup-android@v4
      - if: matrix.target == 'android' && env.KEYSTORE_BASE64 != ''
        run: echo "$KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.keystore"

      - run: scripts/assemble.sh "${{ needs.plan.outputs.ref }}" work
      - if: contains(fromJSON('["windows","macos","linux"]'), matrix.target)
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: work/pack/tauri/src-tauri -> target
      - run: npm install --no-audit --no-fund
        working-directory: work
      - run: npx vite build -c vite.demo.config.ts
        working-directory: work
        env:
          NODE_ENV: production
          SPINDLE_PACK_TARGETS: ${{ matrix.target }}
          DEMO_VERSION: ${{ needs.plan.outputs.version }}
          SPINDLE_KEYSTORE_PATH: ${{ matrix.target == 'android' && env.KEYSTORE_BASE64 != '' && format('{0}/release.keystore', runner.temp) || '' }}
          SPINDLE_KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          SPINDLE_KEY_ALIAS: ${{ secrets.KEY_ALIAS || 'release' }}
          SPINDLE_KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      - uses: actions/upload-artifact@v7
        with:
          name: pack-${{ matrix.target }}
          path: work/dist/pack/${{ matrix.target }}/
          if-no-files-found: error

  release:
    needs: [plan, web, pack]
    if: needs.plan.outputs.release == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v8
        with:
          pattern: pack-*
          path: assets
          merge-multiple: true
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ needs.plan.outputs.ref }}
          REPO: ${{ github.repository }}
        run: |
          ls -la assets
          notes="Demo builds of [spindle-starter $TAG](https://github.com/rohal12/spindle-starter/releases/tag/$TAG). Play it in the browser at https://rohal12.github.io/spindle-starter-demo/."
          if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
            gh release upload "$TAG" assets/* --repo "$REPO" --clobber
          else
            gh release create "$TAG" assets/* --repo "$REPO" --title "Spindle Demo $TAG" --notes "$notes"
          fi
```

- [ ] **Step 2: Lint the workflow**

```bash
mkdir -p .tools && (cd .tools && bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash))
.tools/actionlint .github/workflows/build.yml
```

Expected: no output, exit code 0. Fix anything it reports.

- [ ] **Step 3: Write `README.md`**

```md
# Spindle Starter Demo

A small story built from [spindle-starter](https://github.com/rohal12/spindle-starter), used to test the template's builds and to show what it produces.

- **Play in the browser:** https://rohal12.github.io/spindle-starter-demo/
- **Downloads** (Windows, macOS, Linux, Android, JoiPlay): [Releases](https://github.com/rohal12/spindle-starter-demo/releases)

The macOS app is unsigned: right-click it and choose **Open** the first time. The Android APK is a debug build for sideloading unless the repo has the `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` and `KEY_PASSWORD` secrets, in which case it's a signed release build.

## How it works

This repo doesn't contain a copy of the template. `overlay/` holds only the demo story, assets and `vite.demo.config.ts` (the starter's config plus `spindlePack`). CI runs `scripts/assemble.sh <ref> work`, which fetches spindle-starter at `<ref>` (like `npx degit`), replaces `src/story/` and copies the overlay on top. It then lints, builds, checks the output (`scripts/check-dist.sh`) and packs every target.

| Trigger | Starter ref | Deploys Pages | Creates release |
|---|---|---|---|
| spindle-starter push to `main` | that commit | yes | no |
| spindle-starter release | the release tag | yes | yes, same tag |
| Push to this repo's `main` | `main` | yes | no |
| Manual run (Actions → Build demo) | input `ref` | no | no |

## Local build

    scripts/assemble.sh main work
    cd work && npm install && npm run lint && npm run build
    ../scripts/check-dist.sh .
    # pack one target:
    NODE_ENV=production SPINDLE_PACK_TARGETS=joiplay npx vite build -c vite.demo.config.ts

## Tests

    tests/assemble.test.sh && tests/demo-version.test.sh && tests/check-dist.test.sh

## Credits

Lora font by The Lora Project Authors, SIL Open Font License 1.1 (`overlay/src/assets/fonts/OFL.txt`).
```

- [ ] **Step 4: Run all tests and commit**

```bash
tests/assemble.test.sh && tests/demo-version.test.sh && tests/check-dist.test.sh
git add -A
git commit -m "ci: build, pack, deploy and release workflow"
```

---

### Task 6: Starter: trigger workflow, template-repo guards, postinstall, docs

**Files (spindle-starter, branch `demo-project`):**
- Create: `.github/workflows/trigger-demo.yml`
- Modify: `.github/workflows/build-android.yml`, `build-desktop.yml`, `build-joiplay.yml` (the `jobs.build` key)
- Modify: `scripts/postinstall.sh:7`
- Modify: `readme.md:7` (after the docs link), `docs/index.md` (hero actions)
- Modify: `CHANGELOG.md` (the `## Unreleased` section from Task 4)

**Interfaces:**
- Produces: `repository_dispatch` to `rohal12/spindle-starter-demo` with `event_type` `starter-main` / `starter-release` and `client_payload.ref`, as consumed by Task 5's workflow.

- [ ] **Step 1: Write the postinstall test (fails first)**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
cat > /tmp/postinstall-test.sh <<'EOF'
#!/usr/bin/env bash
# Simulate a degit clone (no .git) and check that postinstall strips template-only files.
set -uo pipefail
repo="$(pwd)"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git -C "$repo" ls-files -z --cached --others --exclude-standard | (cd "$repo" && xargs -0 tar -cf - --) | tar -xf - -C "$tmp"
(cd "$tmp" && bash scripts/postinstall.sh >/dev/null)
rc=0
for f in docs CHANGELOG.md .github/workflows/deploy-docs.yml .github/workflows/trigger-demo.yml; do
  if [ -e "$tmp/$f" ]; then echo "FAIL still present: $f"; rc=1; else echo "ok removed: $f"; fi
done
for f in .github/workflows/build-android.yml .github/workflows/deploy-pages.yml src/story/Start.twee; do
  if [ -e "$tmp/$f" ]; then echo "ok kept: $f"; else echo "FAIL removed: $f"; rc=1; fi
done
exit $rc
EOF
chmod +x /tmp/postinstall-test.sh
```

- [ ] **Step 2: Write `trigger-demo.yml` and run the test to see it fail**

`.github/workflows/trigger-demo.yml`:

```yaml
name: Trigger demo build

# Builds rohal12/spindle-starter-demo against this commit or release.
# Needs the DEMO_DISPATCH_TOKEN secret (fine-grained PAT for
# rohal12/spindle-starter-demo with Contents: read and write).

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  dispatch:
    if: github.repository == 'rohal12/spindle-starter'
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch to spindle-starter-demo
        env:
          GH_TOKEN: ${{ secrets.DEMO_DISPATCH_TOKEN }}
          EVENT_TYPE: ${{ github.event_name == 'release' && 'starter-release' || 'starter-main' }}
          REF: ${{ github.event_name == 'release' && github.event.release.tag_name || github.sha }}
        run: |
          if [ -z "$GH_TOKEN" ]; then
            echo "::notice::DEMO_DISPATCH_TOKEN is not set, skipping the demo build"
            exit 0
          fi
          gh api repos/rohal12/spindle-starter-demo/dispatches \
            -f event_type="$EVENT_TYPE" \
            -f "client_payload[ref]=$REF"
          echo "Dispatched $EVENT_TYPE for $REF"
```

```bash
/tmp/postinstall-test.sh
```

Expected: `FAIL still present: .github/workflows/trigger-demo.yml`, exit code 1.

- [ ] **Step 3: Update postinstall and the build workflows**

In `scripts/postinstall.sh`, change

```bash
  rm -rf docs .github/workflows/deploy-docs.yml CHANGELOG.md
```

to

```bash
  rm -rf docs .github/workflows/deploy-docs.yml .github/workflows/trigger-demo.yml CHANGELOG.md
```

and update the echo to `Cleaned up template-only files (docs, deploy-docs and trigger-demo workflows, changelog).`

In each of `build-android.yml`, `build-desktop.yml` and `build-joiplay.yml`, add this as the first line under `  build:`:

```yaml
    # The template itself has spindlePack disabled; rohal12/spindle-starter-demo builds the binaries
    if: github.repository != 'rohal12/spindle-starter'
```

```bash
/tmp/postinstall-test.sh
```

Expected: every line `ok`, exit code 0.

- [ ] **Step 4: Lint the workflows and check the missing-token path**

```bash
../spindle-starter-demo/.tools/actionlint .github/workflows/*.yml
```

Expected: no output.

Missing-token behaviour (Review Focus 3): run the step's script locally with an empty token:

```bash
GH_TOKEN= EVENT_TYPE=starter-main REF=abc bash -c "$(sed -n '/run: |/,$p' .github/workflows/trigger-demo.yml | tail -n +2 | sed 's/^          //')"; echo "exit $?"
```

Expected: prints `::notice::DEMO_DISPATCH_TOKEN is not set, skipping the demo build` and `exit 0`.

- [ ] **Step 5: Docs and changelog**

In `readme.md`, after the line `**[Read the full documentation](https://rohal12.github.io/spindle-starter/)**`, add:

```md

**[Try the live demo](https://rohal12.github.io/spindle-starter-demo/)**, or download it for [Windows, macOS, Linux, Android and JoiPlay](https://github.com/rohal12/spindle-starter-demo/releases).
```

In `docs/index.md`, add a hero action after `Project Structure`:

```yaml
    - theme: alt
      text: Live Demo
      link: https://rohal12.github.io/spindle-starter-demo/
```

In `CHANGELOG.md`, under `## Unreleased`, add:

```md
- Add [spindle-starter-demo](https://github.com/rohal12/spindle-starter-demo): a demo story built from the template on every push to `main` and every release, with a web version and downloadable builds
- The template repo's own build workflows skip themselves; the demo repo builds the binaries
```

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "ci: trigger demo builds, skip pack workflows in the template repo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: Publish the demo repo and verify end to end

**Files:** none (GitHub setup and verification)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd /media/clemens/storage/git/twine/spindle-starter-demo
gh repo create rohal12/spindle-starter-demo --public --source . --push \
  --description "Demo story built from spindle-starter: web build plus Windows, macOS, Linux, Android and JoiPlay downloads" \
  --homepage https://rohal12.github.io/spindle-starter-demo/
gh api -X POST repos/rohal12/spindle-starter-demo/pages -f build_type=workflow
```

The push to `main` triggers `Build demo` against starter `main`. Note: starter `main` doesn't yet have the Task 4 URL fix, so `check-dist` fails the `web` job on this run. That is expected until Step 6.

- [ ] **Step 2: Run against the starter branch with all fixes**

```bash
gh workflow run build.yml --repo rohal12/spindle-starter-demo -f ref=demo-project
```

Wait for it to finish (`gh run watch`). Expected: `plan`, `web` and all five `pack` jobs succeed. `deploy` and `release` are skipped (manual run). Five `pack-*` artifacts exist (`gh api repos/rohal12/spindle-starter-demo/actions/runs/<id>/artifacts`).

- [ ] **Step 3: Release path against an existing tag**

`v2.2.0` doesn't have the URL fix, so test the release path with `demo-project`, using a throwaway tag:

```bash
gh api repos/rohal12/spindle-starter-demo/dispatches -f event_type=starter-release -f 'client_payload[ref]=demo-project'
```

`demo-project` isn't a version, so the version is `0.0.0` and the release is named `demo-project`. Expected: run succeeds; release `demo-project` has five assets (`.exe`, `.app.zip`, `.AppImage`, `.apk`, `.zip`); Pages deployed.

- [ ] **Step 4: Missing payload ref (Review Focus 5)**

```bash
gh api repos/rohal12/spindle-starter-demo/dispatches -f event_type=starter-main
```

Expected: the `plan` job outputs `ref=main`. (`web` fails `check-dist` until starter `main` has the URL fix, which is expected; check only `plan` here.)

- [ ] **Step 5: Re-run the release (Review Focus 2)**

```bash
gh api repos/rohal12/spindle-starter-demo/dispatches -f event_type=starter-release -f 'client_payload[ref]=demo-project'
```

Expected: run succeeds; the `release` step takes the `gh release upload --clobber` path; the release still has five assets. Then remove the throwaway release:

```bash
gh release delete demo-project --repo rohal12/spindle-starter-demo --cleanup-tag --yes
```

- [ ] **Step 6: Merge the starter branch, set the token, verify the trigger**

1. Open a PR from `demo-project` to `main` in spindle-starter and merge it once the user approves.
2. The user creates the fine-grained PAT (`rohal12/spindle-starter-demo`, Contents read/write) and runs `gh secret set DEMO_DISPATCH_TOKEN --repo rohal12/spindle-starter`.
3. Re-run the `Trigger demo build` run from the merge (`gh run rerun <id>`), or push to `main`.

Expected: `Trigger demo build` logs `Dispatched starter-main for <sha>`; `Build demo` runs with that SHA, all jobs succeed, Pages deploys, and https://rohal12.github.io/spindle-starter-demo/ shows the story with the Lora font and banner.

- [ ] **Step 7: Clean up**

```bash
cd /media/clemens/storage/git/twine/spindle-starter && git push origin --delete ci/test-pack && git branch -D ci/test-pack
```
