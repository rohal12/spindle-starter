# Spindle Pack — Single-File Executable Build Plugin

**Date:** 2026-03-31
**Status:** Approved design

## Goal

Add a Vite plugin (`spindlePack`) that packages the compiled Spindle story into standalone executables for desktop (Windows, macOS, Linux) and a sideloadable Android APK. Also produce a JoiPlay-compatible zip. CI/CD is the primary build environment (GitHub Actions), with local builds as a secondary concern.

## Constraints

- Rendering must be consistent — no visual differences across platforms where possible
- Save data (IndexedDB) must persist reliably across app restarts
- Binaries should be as small as possible
- Portable executables, not installers
- Android target is sideload APK, not Play Store
- Existing build pipeline (`npm run dev`, `npm run build`, publish scripts) must remain unaffected

## Architecture

The plugin runs in Vite's `closeBundle` hook, after twee-ts has compiled the story into `dist/index.html`. It copies the built assets into platform-specific scaffold projects, invokes the native toolchain, and collects the output.

```
vite build
  ├── existing: twee-ts → dist/index.html (+ JS/CSS bundles, media, fonts)
  │
  └── spindlePack plugin (closeBundle):
       ├── tauri     → dist/pack/windows/StoryName.exe
       │              → dist/pack/macos/StoryName.app.zip
       │              → dist/pack/linux/StoryName.AppImage
       │
       ├── capacitor → dist/pack/android/StoryName.apk
       │
       └── joiplay   → dist/pack/joiplay/StoryName-joiplay.zip
```

Targets are opt-in via plugin config. Each target is independent — any subset can be built.

## Desktop — Tauri 2

### Approach

Tauri 2 wraps the story HTML in the OS's native WebView. It does not bundle its own browser engine, resulting in very small binaries (~3-5 MB).

**WebView engines per platform:**
- Windows: Edge WebView2 (Chromium-based, auto-updated by Windows)
- macOS: WKWebView (WebKit)
- Linux: WebKitGTK

This means rendering uses Chromium on Windows but WebKit on macOS/Linux. For a Spindle story using standard HTML/CSS, this is an acceptable trade-off given the dramatic size reduction vs. Electron (~80-115 MB).

### Scaffold

```
pack/tauri/
├── Cargo.toml              # Tauri app dependency, name/version
├── tauri.conf.json         # Window config, app identifier, bundle settings
├── src/
│   └── main.rs             # Minimal Tauri entry point (~10 lines)
├── icons/                  # App icons (auto-generated from source icon)
└── capabilities/           # Tauri v2 permission config
```

### Build process

1. Plugin copies `dist/` contents (HTML, JS, CSS, media, fonts) into the Tauri project's `distDir`
2. Plugin updates `tauri.conf.json` with name, version, window size from config
3. Shells out to `cargo tauri build --target <platform>`
4. Copies the compiled executable from the Cargo build output to `dist/pack/<platform>/`

### Output

- **Windows:** `StoryName.exe` — the compiled binary extracted directly from `target/release/`, bypassing Tauri's installer bundlers (NSIS/MSI). This is a standalone portable executable.
- **macOS:** `StoryName.app` zipped — standard app bundle. Tauri produces this natively. Zipped for distribution since `.app` is a directory.
- **Linux:** `StoryName.AppImage` — single-file executable. Tauri's AppImage bundler produces this directly.

### Prerequisites

- Rust toolchain (`rustup`)
- Platform-specific deps: Linux needs `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, etc.
- These are pre-installed or installable on GitHub Actions runners

## Android — Capacitor

### Approach

Capacitor wraps the story HTML in an Android WebView (system Chrome WebView, Chromium-based). Produces a standard APK (~4-6 MB).

### Scaffold

```
pack/capacitor/
├── capacitor.config.ts     # App ID, name, webDir
├── android/                # Generated Android project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   └── res/        # App icons
│   │   └── build.gradle
│   └── build.gradle
└── package.json            # @capacitor/core, @capacitor/android
```

### Build process

1. Plugin copies `dist/` contents into Capacitor's web assets directory
2. Runs `npx cap sync android`
3. Runs `npx cap build android` (with keystore args for signing, or unsigned for dev)
4. Copies the APK to `dist/pack/android/StoryName.apk`

### Configuration

- `androidScheme: "http"` — prevents origin changes on Capacitor upgrades that would wipe IndexedDB/localStorage
- Minimum SDK: 24 (Android 7.0, ~97% device coverage)
- Universal APK (all architectures)

### Signing

- CI: self-signed keystore stored as GitHub Actions secret (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`)
- Local: auto-generated debug keystore

## JoiPlay

Zero build effort. The plugin zips the existing `dist/` output with a README:

```
dist/pack/joiplay/StoryName-joiplay.zip
├── index.html
├── scripts/
├── styles/
├── fonts/
├── media/
└── README.txt    # "Extract, open JoiPlay, tap +, select index.html"
```

JoiPlay's HTML plugin needs only an `index.html` at the root. No manifest or metadata required.

## Persistence — IndexedDB

Spindle supports IndexedDB as a storage backend. IndexedDB persists reliably across all target environments:

- Tauri desktop WebViews (WebView2, WKWebView, WebKitGTK)
- Capacitor Android WebView
- JoiPlay's embedded WebView
- Standard browsers (existing web distribution)

No storage adapter, plugin, or conditional code needed. Configure Spindle to use IndexedDB and it works everywhere.

## Plugin Configuration

In `vite.config.ts`:

```typescript
import { spindlePack } from './pack/plugin'

export default defineConfig({
  plugins: [
    // ... existing plugins
    spindlePack({
      name: 'My Story',
      identifier: 'com.author.mystory',
      icon: 'src/assets/media/icon.png',
      version: '1.0.0',
      targets: ['windows', 'macos', 'linux', 'android', 'joiplay'],
      window: {
        width: 960,
        height: 600,
        minWidth: 480,
        minHeight: 320,
      }
    })
  ]
})
```

## Plugin Code Structure

```
pack/
├── plugin.ts               # Vite plugin entry (closeBundle hook)
├── tauri/                   # Tauri scaffold (checked in)
├── capacitor/               # Capacitor scaffold (checked in)
└── scripts/
    ├── build-tauri.ts       # Copies assets, invokes cargo tauri build
    ├── build-capacitor.ts   # Copies assets, invokes cap sync + build
    └── build-joiplay.ts     # Zips dist/ with readme
```

The plugin reads config, delegates to the appropriate build script per target. Each script is ~50-100 lines: file copying + subprocess invocation.

**Checked into repo:** scaffolds, plugin code, icons source
**Generated (gitignored):** binaries, APK, intermediate build artifacts

## CI/CD — GitHub Actions

Three separate workflows, all triggered via `workflow_dispatch` and optionally on release tags.

### `.github/workflows/build-desktop.yml`

- **Matrix:** `[windows-latest, macos-latest, ubuntu-latest]`
- **Steps:** Install Rust toolchain → install system deps (Linux only) → `npm ci` → `vite build` with desktop targets
- **Artifacts:** Uploads platform executable to workflow run
- **On release tag:** Attaches binaries to GitHub Release

### `.github/workflows/build-android.yml`

- **Runner:** `ubuntu-latest`
- **Steps:** Setup Java + Android SDK → `npm ci` → `vite build` with android target
- **Signing:** Keystore from secrets
- **Artifacts:** Uploads `.apk`

### `.github/workflows/build-joiplay.yml`

- **Runner:** `ubuntu-latest`
- **Steps:** `npm ci` → `vite build` with joiplay target
- **Artifacts:** Uploads `.zip`

## Error Handling

The plugin detects missing prerequisites and provides clear error messages:

- Missing Rust toolchain → "Rust is required for desktop builds. Install via https://rustup.rs"
- Missing Android SDK → "Android SDK is required for Android builds. Set ANDROID_HOME or install Android Studio"
- Missing platform deps on Linux → lists the specific `apt install` command

Build failures from the native toolchains are passed through with full output.

## What Does NOT Change

- `npm run dev` — unaffected, the plugin only runs in production builds
- `npm run build` without `spindlePack` in config — produces `dist/` as before
- `npm run publish:pages` / `npm run publish:itch` — unaffected
- Story source files, Spindle format, twee-ts compilation — all unchanged
