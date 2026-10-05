# Spindle Starter Demo — Build Test and Public Demo

**Date:** 2026-10-05
**Status:** Approved design (updated during planning: config extension and output check)

## Goal

A small demo project, built from spindle-starter, that serves two purposes:

1. **Regression test.** Exercise the template's real build pipeline (lint, web build, every `spindlePack` target) in CI, so broken builds are caught before a release. Recent examples it would have caught: pack targets failing with `ERR_MODULE_NOT_FOUND`, `setup-android@v3` failing on current runners, Tauri rejecting `_` in bundle identifiers, Capacitor 7 needing JDK 21.
2. **Public demo.** A playable web version and downloadable desktop/Android/JoiPlay builds that show what the starter produces.

## Constraints

- spindle-starter's defaults stay unchanged: `spindlePack` remains opt-in, `npm run build` behaves as today.
- The demo never drifts from the template: it always builds against a specific spindle-starter ref.
- Starter PRs are not gated by the demo. It runs on starter `main` pushes, starter releases, and manual dispatch.
- Nothing demo-specific reaches users who degit the template.

## Repository

New public repo `rohal12/spindle-starter-demo`. It contains only the demo-specific overlay, a local assembly script and its workflows, never a copy of the template.

```
spindle-starter-demo/
├── overlay/                      # copied over a fresh spindle-starter checkout
│   ├── src/story/*.twee          # demo story (replaces the hello-world passages)
│   ├── src/assets/media/         # icon.png (1024×1024) and an image used in a passage
│   ├── src/assets/fonts/         # one .woff2 font
│   ├── src/assets/app/           # index.ts + styles/index.scss
│   └── vite.demo.config.ts       # extends the starter config with spindlePack
├── scripts/assemble.sh           # assemble a buildable project from starter@ref + overlay
├── scripts/check-dist.sh         # assert the web build is complete
├── scripts/demo-version.sh       # ref → semver version
├── .github/workflows/build.yml
└── README.md
```

### Assembly

`scripts/assemble.sh <ref> <dir>`:

1. Fetch spindle-starter at `<ref>` (branch, tag or SHA) into `<dir>` without `.git`, the way `npx degit` does.
2. Delete `<dir>/src/story/*` and copy `overlay/` over `<dir>`.
3. Leave `npm install` to the caller. Because there is no `.git`, the starter's postinstall runs its degit cleanup, which is tested as a side effect.

CI and local reproduction both use this script.

### Demo content

Around five passages that exercise the features most likely to break a build:

- links and navigation between passages
- a variable declared in `StoryVariables` and used in a passage
- an image referenced as `media/...` in a passage, and the favicon via `src/head-content.html`
- a custom `.woff2` font and an SCSS theme (`src/assets/fonts`, `styles/index.scss`)
- a small TypeScript script that uses the Story API (typed via `globals.d.ts`)
- the default `StoryInterface` menubar with save/load

`overlay/src/assets/media/icon.png` takes the real icon path in `spindlePack`, not the favicon fallback.

The demo story must pass `npm run lint` (`spindle-lsp check`).

### Vite config

`overlay/vite.demo.config.ts` extends the starter's own `vite.config.ts` with `mergeConfig` and adds `spindlePack`:

```ts
spindlePack({
  name: 'Spindle Demo',
  identifier: 'com.rohal12.spindledemo',
  icon: 'src/assets/media/icon.png',
  version: process.env.DEMO_VERSION || '0.0.0',
  targets: [],
})
```

Pack builds run `npx vite build -c vite.demo.config.ts`. Because it extends rather than replaces the starter's config, changes to the starter's `vite.config.ts` are picked up automatically. If the starter's config stops being a plain config object, or the pack plugin's export changes, the demo build fails. `targets: []` means nothing is packed unless `SPINDLE_PACK_TARGETS` selects a target. `DEMO_VERSION` is set by CI from the starter tag (without the `v`). Refs that aren't version tags use `0.0.0`.

### Output check

`scripts/check-dist.sh` asserts that the web build contains the overlay's passages, the inlined script and font, `dist/media/` and `dist/fonts/`, and relative asset URLs (no `url(/`). The relative-URL check exposed a starter bug: Vite emitted `url(/fonts/...)` into the inlined CSS, which breaks on Pages project sites and `file://`. The starter fixes it with `experimental.renderBuiltUrl` in `vite.config.ts`.

## CI: `build.yml` in the demo repo

### Triggers

| Event | Ref built | Pages deploy | Release |
|---|---|---|---|
| `repository_dispatch` type `starter-main` (payload `ref` = SHA) | payload ref | yes | no |
| `repository_dispatch` type `starter-release` (payload `ref` = tag) | payload ref | no | yes, same tag (`--prerelease` if the version has a `-` suffix) |
| `workflow_dispatch` (input `ref`, default `main`; optional `version` override) | input ref | no | no |
| `push` to demo `main` | starter `main` | yes | no |

The Pages site always shows starter `main`. Builds of `main` (starter pushes and demo pushes) share one concurrency group, `demo-main`, so a newer run cancels an older one and the site never goes backwards. Other runs are grouped per event type and ref. Release runs are never cancelled. The decisions are made by `scripts/plan.sh`, which is unit-tested.

Permissions: `contents: read` by default; `deploy` gets `pages: write` and `id-token: write`; `release` gets `contents: write`. The demo repo's Pages source is set to "GitHub Actions".

### Jobs

1. **`web`** (ubuntu): assemble, `npm install`, `npm run lint`, `tsc --noEmit`, `npm run build` with `NODE_ENV=production` and `SPINDLE_PACK_TARGETS=none`, then `scripts/check-dist.sh`. Upload `dist/` as the Pages artifact. A dependent `deploy` job publishes it with `actions/deploy-pages` when the trigger table says so.
2. **`pack`** (matrix, `fail-fast: false`):

   | target | runner | extra setup |
   |---|---|---|
   | windows | windows-latest | Rust |
   | macos | macos-latest | Rust |
   | linux | ubuntu-latest | Rust, webkit2gtk/appindicator/rsvg/patchelf |
   | android | ubuntu-latest | JDK 21 (Temurin), `android-actions/setup-android@v4` |
   | joiplay | ubuntu-latest | none |

   Each job assembles, runs `npm install`, then `npx vite build -c vite.demo.config.ts` with `NODE_ENV=production` and `SPINDLE_PACK_TARGETS=<target>`. It uploads `dist/pack/<target>/` with `if-no-files-found: error`. Rust jobs use `Swatinem/rust-cache` keyed on `pack/tauri/src-tauri`. Setup steps match the starter's `build-*.yml` workflows, which must be kept in step.
3. **`release`** (only for `starter-release`, needs `web` and all `pack` jobs): download all pack artifacts and create a demo release with the starter's tag. Attach the `.exe`, `.app.zip`, `.AppImage`, `.apk` and JoiPlay `.zip`. The release notes link to the starter release.

### Signing

- **Android:** a debug APK unless the demo repo has keystore secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`), using the same mechanism as the starter's `build-android.yml`.
- **macOS:** unsigned. Gatekeeper warns on first launch. The README explains how to open it.

### Failure visibility

Failed runs notify the repo owner through GitHub's standard Actions notifications. There is no status reporting back to starter commits (YAGNI).

## Changes in spindle-starter

1. **`.github/workflows/trigger-demo.yml`:** on `push` to `main` and on `release: published`, send `repository_dispatch` to `rohal12/spindle-starter-demo` with event type `starter-main` (payload `ref` = `github.sha`) or `starter-release` (payload `ref` = the release tag). Authenticated with the secret `DEMO_DISPATCH_TOKEN`: a fine-grained PAT limited to `spindle-starter-demo` with Contents read/write, which the repo owner creates manually. The job runs only when `github.repository == 'rohal12/spindle-starter'`.
2. **`build-android.yml`, `build-desktop.yml`, `build-joiplay.yml`:** add `if: github.repository != 'rohal12/spindle-starter'` to the job. In the template repo, pack is disabled and the demo builds the binaries, so these runs only produced failures. Users' repos are unaffected.
3. **`scripts/postinstall.sh`:** also remove `.github/workflows/trigger-demo.yml` on a fresh degit clone, like `deploy-docs.yml`.
4. **Docs:** link the live demo (`https://rohal12.github.io/spindle-starter-demo/`) and the demo releases from `readme.md` and `docs/index.md` / `docs/publishing.md`.

## Testing the setup itself

- `scripts/assemble.sh main /tmp/demo && cd /tmp/demo && npm install && npm run lint && npm run build` succeeds locally.
- A `workflow_dispatch` run of `build.yml` against starter `main` is green for `web` and all five `pack` targets, each producing its artifact.
- A `repository_dispatch` of type `starter-release` with an existing tag (`v2.2.0`) creates a demo release with five assets. This is run once, and the test release is deleted afterwards if it isn't wanted.
- After `DEMO_DISPATCH_TOKEN` is set, a push to starter `main` triggers a demo run and refreshes the Pages site.

## Out of scope

- Gating starter PRs on the demo build.
- Code signing and notarization for macOS and Windows.
- Running the starter's own `build-*.yml` YAML in the demo. The demo mirrors their steps instead, so divergence between the two is a manual-review risk.
