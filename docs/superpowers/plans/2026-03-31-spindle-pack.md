# Spindle Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vite plugin that packages compiled Spindle stories into portable desktop executables (Windows/macOS/Linux via Tauri 2) and Android APK (via Capacitor), plus a JoiPlay-compatible zip.

**Architecture:** Post-build packaging via Vite `closeBundle` hook. The plugin copies `dist/` output into platform-specific scaffold projects (Tauri for desktop, Capacitor for Android), invokes native build tools, and collects binaries into `dist/pack/`. Each target is independent and opt-in.

**Tech Stack:** Vite 7, Tauri 2 (Rust + system WebView), Capacitor 7 (Android WebView), archiver (zip creation), GitHub Actions (CI/CD)

---

## File Structure

**New files:**

| File | Responsibility |
|------|---------------|
| `pack/types.ts` | Plugin config types (`SpindlePackConfig`, `Target`) |
| `pack/plugin.ts` | Vite plugin entry — `closeBundle` hook, dispatches to per-target build scripts |
| `pack/scripts/build-joiplay.ts` | Zips `dist/` contents with a README into a JoiPlay-compatible archive |
| `pack/scripts/build-tauri.ts` | Copies web assets into Tauri scaffold, invokes Tauri CLI, collects platform binary |
| `pack/scripts/build-capacitor.ts` | Copies web assets into Capacitor project, syncs + builds APK |
| `pack/tauri/src-tauri/Cargo.toml` | Tauri Rust project manifest |
| `pack/tauri/src-tauri/build.rs` | Tauri build script (1 line) |
| `pack/tauri/src-tauri/tauri.conf.json` | App window config, identifier, bundle settings |
| `pack/tauri/src-tauri/src/main.rs` | Minimal Tauri entry point |
| `pack/tauri/src-tauri/capabilities/default.json` | Default permissions (core:default) |
| `pack/capacitor/package.json` | Capacitor dependencies (isolated from main project) |
| `pack/capacitor/capacitor.config.ts` | App ID, name, webDir, androidScheme |
| `pack/capacitor/android/` | Generated Android project (via `npx cap add android`) |
| `.github/workflows/build-desktop.yml` | Desktop builds via matrix (windows/macos/ubuntu) |
| `.github/workflows/build-android.yml` | Android APK build |
| `.github/workflows/build-joiplay.yml` | JoiPlay zip build |

**Modified files:**

| File | Change |
|------|--------|
| `package.json` | Add `archiver`, `@types/archiver` devDependencies |
| `.gitignore` | Add pack build artifacts |

---

## Testing Strategy

This plugin is build orchestration — it copies files and shells out to native toolchains (Cargo, Gradle). Unit testing subprocess calls provides no value. Verification happens via:

- **JoiPlay:** Run `vite build` locally, check zip exists with correct structure
- **Tauri:** CI workflow produces executables (requires Rust toolchain)
- **Capacitor:** CI workflow produces APK (requires Android SDK)
- **Integration:** Each task includes a manual verification step

---

### Task 1: Dependencies and plugin types

**Files:**
- Modify: `package.json`
- Create: `pack/types.ts`

- [ ] **Step 1: Add archiver dependency**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
npm install --save-dev archiver @types/archiver
```

- [ ] **Step 2: Create plugin config types**

Create `pack/types.ts`:

```typescript
export type Target = 'windows' | 'macos' | 'linux' | 'android' | 'joiplay';

export interface WindowConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export interface SpindlePackConfig {
  /** Display name for the app (used in window title, binary name, APK label) */
  name: string;
  /** Reverse-domain identifier (e.g. 'com.author.mystory') */
  identifier: string;
  /** Path to source icon PNG (minimum 1024x1024) */
  icon: string;
  /** App version string */
  version: string;
  /** Which platforms to build */
  targets: Target[];
  /** Window dimensions for desktop builds */
  window?: WindowConfig;
}

export interface BuildContext {
  /** Resolved plugin config with defaults applied */
  config: Required<SpindlePackConfig>;
  /** Absolute path to the project root */
  projectRoot: string;
  /** Absolute path to the Vite output directory (dist/) */
  distDir: string;
  /** Absolute path to the pack output directory (dist/pack/) */
  outDir: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add pack/types.ts package.json
git commit -m "feat(pack): add archiver dep and plugin config types"
```

---

### Task 2: Vite plugin skeleton and JoiPlay target

**Files:**
- Create: `pack/plugin.ts`
- Create: `pack/scripts/build-joiplay.ts`

- [ ] **Step 1: Create the JoiPlay build script**

Create `pack/scripts/build-joiplay.ts`:

```typescript
import { createWriteStream, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import archiver from 'archiver';
import type { BuildContext } from '../types.js';

const README_TEXT = `JoiPlay HTML Game

To play this story in JoiPlay:

1. Install JoiPlay and the JoiPlay HTML Plugin from the Play Store
2. Extract this zip to a folder on your device
3. Open JoiPlay, tap the + button
4. Select the index.html file from the extracted folder
5. Tap Play

Enjoy!
`;

export async function buildJoiPlay(ctx: BuildContext): Promise<void> {
  const outDir = join(ctx.outDir, 'joiplay');
  mkdirSync(outDir, { recursive: true });

  const zipName = `${ctx.config.name.replace(/\s+/g, '-')}-joiplay.zip`;
  const zipPath = join(outDir, zipName);

  console.log(`[spindle-pack] Creating JoiPlay zip: ${zipName}`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    // Add all dist/ contents
    archive.directory(ctx.distDir, false);

    // Add README
    archive.append(README_TEXT, { name: 'README.txt' });

    archive.finalize();
  });

  console.log(`[spindle-pack] JoiPlay zip created: ${zipPath}`);
}
```

- [ ] **Step 2: Create the Vite plugin**

Create `pack/plugin.ts`:

```typescript
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import type { Plugin } from 'vite';
import type { SpindlePackConfig, BuildContext, Target } from './types.js';
import { buildJoiPlay } from './scripts/build-joiplay.js';

const DEFAULT_WINDOW = {
  width: 960,
  height: 600,
  minWidth: 480,
  minHeight: 320,
};

const DESKTOP_TARGETS: Target[] = ['windows', 'macos', 'linux'];

function resolveConfig(config: SpindlePackConfig): Required<SpindlePackConfig> {
  return {
    ...config,
    window: { ...DEFAULT_WINDOW, ...config.window },
  };
}

export function spindlePack(config: SpindlePackConfig): Plugin {
  const resolved = resolveConfig(config);

  return {
    name: 'vite-plugin-spindle-pack',
    apply: 'build',

    async closeBundle() {
      // Only run in production builds
      if (process.env.NODE_ENV !== 'production') return;

      const projectRoot = resolve(import.meta.dirname!, '..');
      const distDir = resolve(projectRoot, 'dist');
      const outDir = resolve(distDir, 'pack');

      mkdirSync(outDir, { recursive: true });

      const ctx: BuildContext = {
        config: resolved,
        projectRoot,
        distDir,
        outDir,
      };

      // Allow CI to override targets via env var (e.g. SPINDLE_PACK_TARGETS=windows)
      const envTargets = process.env.SPINDLE_PACK_TARGETS;
      const targets: Target[] = envTargets
        ? (envTargets.split(',') as Target[])
        : resolved.targets;

      for (const target of targets) {
        try {
          await buildTarget(target, ctx);
        } catch (err) {
          console.error(`[spindle-pack] Failed to build target '${target}':`, err);
          throw err;
        }
      }
    },
  };
}

async function buildTarget(target: Target, ctx: BuildContext): Promise<void> {
  switch (target) {
    case 'joiplay':
      await buildJoiPlay(ctx);
      break;

    case 'windows':
    case 'macos':
    case 'linux': {
      const { buildTauri } = await import('./scripts/build-tauri.js');
      await buildTauri(target, ctx);
      break;
    }

    case 'android': {
      const { buildCapacitor } = await import('./scripts/build-capacitor.js');
      await buildCapacitor(ctx);
      break;
    }
  }
}
```

- [ ] **Step 3: Verify JoiPlay target works**

Temporarily add the plugin to `vite.config.ts` for testing:

```typescript
import { spindlePack } from './pack/plugin.js';

// In the plugins array, AFTER spindlePlugin():
spindlePack({
  name: 'Test Story',
  identifier: 'com.test.story',
  icon: 'src/assets/media/favicon.svg',
  version: '1.0.0',
  targets: ['joiplay'],
})
```

Run:

```bash
NODE_ENV=production npx vite build
```

Expected: `dist/pack/joiplay/Test-Story-joiplay.zip` exists containing `index.html`, `scripts/`, `styles/`, and `README.txt`.

Verify:

```bash
unzip -l dist/pack/joiplay/Test-Story-joiplay.zip
```

Then **revert** the vite.config.ts change (the plugin stays commented out — story authors opt in).

- [ ] **Step 4: Commit**

```bash
git add pack/plugin.ts pack/scripts/build-joiplay.ts
git commit -m "feat(pack): add vite plugin skeleton with joiplay target"
```

---

### Task 3: Tauri scaffold

**Files:**
- Create: `pack/tauri/src-tauri/Cargo.toml`
- Create: `pack/tauri/src-tauri/build.rs`
- Create: `pack/tauri/src-tauri/src/main.rs`
- Create: `pack/tauri/src-tauri/tauri.conf.json`
- Create: `pack/tauri/src-tauri/capabilities/default.json`

- [ ] **Step 1: Create Cargo.toml**

Create `pack/tauri/src-tauri/Cargo.toml`:

```toml
[package]
name = "spindle-story"
version = "0.1.0"
description = "A Spindle interactive fiction story"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Create build.rs**

Create `pack/tauri/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Create main.rs**

Create `pack/tauri/src-tauri/src/main.rs`:

```rust
// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Create tauri.conf.json**

Create `pack/tauri/src-tauri/tauri.conf.json`:

The `frontendDist` path and other values are **templates** — the build script overwrites them at build time. The checked-in values are placeholders for documentation clarity.

```json
{
  "productName": "Spindle Story",
  "version": "0.1.0",
  "identifier": "com.example.spindle-story",
  "build": {
    "frontendDist": "../web-assets"
  },
  "app": {
    "windows": [
      {
        "title": "Spindle Story",
        "width": 960,
        "height": 600,
        "minWidth": 480,
        "minHeight": 320
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 5: Create capabilities/default.json**

Create `pack/tauri/src-tauri/capabilities/default.json`:

```json
{
  "identifier": "default",
  "description": "Default capabilities for the story app",
  "windows": ["main"],
  "permissions": [
    "core:default"
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add pack/tauri/
git commit -m "feat(pack): add tauri v2 scaffold for desktop builds"
```

---

### Task 4: Tauri build script

**Files:**
- Create: `pack/scripts/build-tauri.ts`

- [ ] **Step 1: Create the Tauri build script**

Create `pack/scripts/build-tauri.ts`:

```typescript
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync } from 'child_process';
import { resolve, join } from 'path';
import type { BuildContext, Target } from '../types.js';

const TAURI_DIR = resolve(import.meta.dirname!, '../tauri');
const SRC_TAURI = join(TAURI_DIR, 'src-tauri');

function checkPrerequisites(): void {
  try {
    execSync('rustc --version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      '[spindle-pack] Rust is required for desktop builds. Install via https://rustup.rs'
    );
  }
}

/** Returns the bundle type for post-build bundling, or null for Windows (raw .exe). */
function getBundleFlag(target: Target): string | null {
  switch (target) {
    case 'windows':
      return null; // No bundling — grab portable .exe from target/release/
    case 'macos':
      return 'app';
    case 'linux':
      return 'appimage';
    default:
      throw new Error(`Not a desktop target: ${target}`);
  }
}

function updateTauriConfig(ctx: BuildContext): void {
  const configPath = join(SRC_TAURI, 'tauri.conf.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  config.productName = ctx.config.name;
  config.version = ctx.config.version;
  config.identifier = ctx.config.identifier;
  config.build.frontendDist = join(TAURI_DIR, 'web-assets');
  config.app.windows[0].title = ctx.config.name;
  config.app.windows[0].width = ctx.config.window.width;
  config.app.windows[0].height = ctx.config.window.height;
  config.app.windows[0].minWidth = ctx.config.window.minWidth;
  config.app.windows[0].minHeight = ctx.config.window.minHeight;

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function copyWebAssets(ctx: BuildContext): void {
  const webAssetsDir = join(TAURI_DIR, 'web-assets');
  mkdirSync(webAssetsDir, { recursive: true });
  cpSync(ctx.distDir, webAssetsDir, { recursive: true });
}

function generateIcons(ctx: BuildContext): void {
  if (!existsSync(ctx.config.icon)) {
    console.warn(
      `[spindle-pack] Icon not found: ${ctx.config.icon}, using Tauri defaults`
    );
    return;
  }

  console.log('[spindle-pack] Generating app icons...');
  execSync(
    `npx @tauri-apps/cli@latest icon "${resolve(ctx.config.icon)}"`,
    { cwd: TAURI_DIR, stdio: 'inherit' }
  );
}

function findOutput(target: Target, ctx: BuildContext): string {
  const binaryName = ctx.config.name.replace(/\s+/g, '-').toLowerCase();
  const releaseDir = join(SRC_TAURI, 'target', 'release');
  const bundleDir = join(releaseDir, 'bundle');

  switch (target) {
    case 'windows': {
      // Grab the portable .exe from target/release/
      const exe = join(releaseDir, `${binaryName}.exe`);
      if (existsSync(exe)) return exe;
      // Tauri may use productName directly
      const altExe = join(releaseDir, `${ctx.config.name}.exe`);
      if (existsSync(altExe)) return altExe;
      // Search for any .exe that isn't a build tool
      const exes = readdirSync(releaseDir).filter(
        (f) => f.endsWith('.exe') && !f.startsWith('build-script')
      );
      if (exes.length > 0) return join(releaseDir, exes[0]);
      throw new Error(`[spindle-pack] Could not find Windows executable in ${releaseDir}`);
    }

    case 'macos': {
      const appDir = join(bundleDir, 'macos');
      if (!existsSync(appDir)) throw new Error(`[spindle-pack] macOS bundle not found: ${appDir}`);
      const apps = readdirSync(appDir).filter((f) => f.endsWith('.app'));
      if (apps.length === 0) throw new Error(`[spindle-pack] No .app found in ${appDir}`);
      return join(appDir, apps[0]);
    }

    case 'linux': {
      const appImageDir = join(bundleDir, 'appimage');
      if (!existsSync(appImageDir)) throw new Error(`[spindle-pack] AppImage dir not found: ${appImageDir}`);
      const images = readdirSync(appImageDir).filter((f) => f.endsWith('.AppImage'));
      if (images.length === 0) throw new Error(`[spindle-pack] No .AppImage found in ${appImageDir}`);
      return join(appImageDir, images[0]);
    }

    default:
      throw new Error(`Not a desktop target: ${target}`);
  }
}

function collectOutput(target: Target, outputPath: string, ctx: BuildContext): void {
  const targetDir = join(ctx.outDir, target);
  mkdirSync(targetDir, { recursive: true });

  const storyName = ctx.config.name.replace(/\s+/g, '-');

  switch (target) {
    case 'windows':
      cpSync(outputPath, join(targetDir, `${storyName}.exe`));
      break;

    case 'macos':
      // Zip the .app directory for distribution
      execSync(
        `zip -r "${join(targetDir, `${storyName}.app.zip`)}" "${outputPath}"`,
        { stdio: 'inherit' }
      );
      break;

    case 'linux':
      cpSync(outputPath, join(targetDir, `${storyName}.AppImage`));
      break;
  }
}

export async function buildTauri(target: Target, ctx: BuildContext): Promise<void> {
  console.log(`[spindle-pack] Building ${target} executable via Tauri...`);

  checkPrerequisites();
  copyWebAssets(ctx);
  updateTauriConfig(ctx);
  generateIcons(ctx);

  const bundleFlag = getBundleFlag(target);

  // Build the binary without bundling first
  execSync('npx @tauri-apps/cli@latest build --no-bundle', {
    cwd: TAURI_DIR,
    stdio: 'inherit',
    env: { ...process.env },
  });

  // For macOS and Linux, run the bundler to produce .app / .AppImage
  // For Windows, skip bundling — we use the portable .exe directly
  if (bundleFlag) {
    execSync(`npx @tauri-apps/cli@latest bundle --bundles ${bundleFlag}`, {
      cwd: TAURI_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });
  }

  const outputPath = findOutput(target, ctx);
  collectOutput(target, outputPath, ctx);

  console.log(`[spindle-pack] ${target} build complete.`);
}
```

- [ ] **Step 2: Verify the script compiles**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
npx tsx --eval "import './pack/scripts/build-tauri.js'"
```

Expected: No errors (the import resolves, types check). The script won't actually run without Rust installed — that's fine, CI handles it.

- [ ] **Step 3: Commit**

```bash
git add pack/scripts/build-tauri.ts
git commit -m "feat(pack): add tauri build script for desktop targets"
```

---

### Task 5: Capacitor scaffold

**Files:**
- Create: `pack/capacitor/package.json`
- Create: `pack/capacitor/capacitor.config.ts`
- Generate: `pack/capacitor/android/` (via `npx cap add android`)

- [ ] **Step 1: Create Capacitor package.json**

Create `pack/capacitor/package.json`:

```json
{
  "name": "spindle-story-android",
  "private": true,
  "type": "module",
  "dependencies": {
    "@capacitor/android": "^7.0.0",
    "@capacitor/cli": "^7.0.0",
    "@capacitor/core": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create Capacitor config**

Create `pack/capacitor/capacitor.config.ts`:

The `appId` and `appName` are templates — the build script overwrites them at build time.

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.spindle-story',
  appName: 'Spindle Story',
  webDir: 'web-assets',
  server: {
    androidScheme: 'http',
  },
};

export default config;
```

- [ ] **Step 3: Install Capacitor deps and generate Android project**

```bash
cd /media/clemens/storage/git/twine/spindle-starter/pack/capacitor
npm install
mkdir -p web-assets
echo "<html><body>placeholder</body></html>" > web-assets/index.html
npx cap add android
rm -rf web-assets
```

The `web-assets/` directory with a placeholder is needed because `cap add` requires `webDir` to exist. It's removed after generation since the build script populates it at build time.

Verify the android project was created:

```bash
ls pack/capacitor/android/app/src/main/AndroidManifest.xml
```

Expected: File exists.

- [ ] **Step 4: Commit**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
git add pack/capacitor/package.json pack/capacitor/capacitor.config.ts pack/capacitor/android/
git commit -m "feat(pack): add capacitor scaffold for android builds"
```

---

### Task 6: Capacitor build script

**Files:**
- Create: `pack/scripts/build-capacitor.ts`

- [ ] **Step 1: Create the Capacitor build script**

Create `pack/scripts/build-capacitor.ts`:

```typescript
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync } from 'child_process';
import { resolve, join } from 'path';
import type { BuildContext } from '../types.js';

const CAP_DIR = resolve(import.meta.dirname!, '../capacitor');

function checkPrerequisites(): void {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!androidHome) {
    throw new Error(
      '[spindle-pack] Android SDK is required for Android builds. ' +
      'Set ANDROID_HOME or install Android Studio. ' +
      'See https://capacitorjs.com/docs/getting-started/environment-setup'
    );
  }
}

function updateCapacitorConfig(ctx: BuildContext): void {
  const configPath = join(CAP_DIR, 'capacitor.config.ts');
  const content = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${ctx.config.identifier}',
  appName: '${ctx.config.name}',
  webDir: 'web-assets',
  server: {
    androidScheme: 'http',
  },
};

export default config;
`;
  writeFileSync(configPath, content);
}

function installDeps(): void {
  if (!existsSync(join(CAP_DIR, 'node_modules'))) {
    console.log('[spindle-pack] Installing Capacitor dependencies...');
    execSync('npm ci', { cwd: CAP_DIR, stdio: 'inherit' });
  }
}

function copyWebAssets(ctx: BuildContext): void {
  const webAssetsDir = join(CAP_DIR, 'web-assets');
  mkdirSync(webAssetsDir, { recursive: true });
  cpSync(ctx.distDir, webAssetsDir, { recursive: true });
}

function findApk(): string {
  const apkDirs = [
    join(CAP_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug'),
    join(CAP_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'release'),
  ];

  for (const dir of apkDirs) {
    if (!existsSync(dir)) continue;
    const apks = readdirSync(dir).filter((f) => f.endsWith('.apk'));
    if (apks.length > 0) return join(dir, apks[0]);
  }

  throw new Error('[spindle-pack] Could not find APK output');
}

export async function buildCapacitor(ctx: BuildContext): Promise<void> {
  console.log('[spindle-pack] Building Android APK via Capacitor...');

  checkPrerequisites();
  installDeps();
  updateCapacitorConfig(ctx);
  copyWebAssets(ctx);

  // Sync web assets into the Android project
  execSync('npx cap sync android', { cwd: CAP_DIR, stdio: 'inherit' });

  // Check for signing config (CI provides these via env vars)
  const keystorePath = process.env.SPINDLE_KEYSTORE_PATH;
  const keystorePass = process.env.SPINDLE_KEYSTORE_PASSWORD;
  const keyAlias = process.env.SPINDLE_KEY_ALIAS || 'release';
  const keyPass = process.env.SPINDLE_KEY_PASSWORD || keystorePass;

  if (keystorePath && keystorePass) {
    // Signed release build
    console.log('[spindle-pack] Building signed release APK...');
    execSync(
      `npx cap build android ` +
      `--keystorepath "${keystorePath}" ` +
      `--keystorepass "${keystorePass}" ` +
      `--keystorealias "${keyAlias}" ` +
      `--keystorealiaspass "${keyPass}" ` +
      `--androidreleasetype APK`,
      { cwd: CAP_DIR, stdio: 'inherit' }
    );
  } else {
    // Debug build (unsigned, suitable for sideloading)
    console.log('[spindle-pack] Building debug APK (no keystore configured)...');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    execSync(`${gradlew} assembleDebug`, {
      cwd: join(CAP_DIR, 'android'),
      stdio: 'inherit',
    });
  }

  // Collect output
  const apkPath = findApk();
  const outDir = join(ctx.outDir, 'android');
  mkdirSync(outDir, { recursive: true });

  const storyName = ctx.config.name.replace(/\s+/g, '-');
  cpSync(apkPath, join(outDir, `${storyName}.apk`));

  console.log('[spindle-pack] Android build complete.');
}
```

- [ ] **Step 2: Verify the script compiles**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
npx tsx --eval "import './pack/scripts/build-capacitor.js'"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add pack/scripts/build-capacitor.ts
git commit -m "feat(pack): add capacitor build script for android target"
```

---

### Task 7: GitHub Actions — desktop workflow

**Files:**
- Create: `.github/workflows/build-desktop.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/build-desktop.yml`:

```yaml
name: Build Desktop Executables

on:
  workflow_dispatch:
  release:
    types: [published]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            target: windows
            artifact: dist/pack/windows/
          - os: macos-latest
            target: macos
            artifact: dist/pack/macos/
          - os: ubuntu-latest
            target: linux
            artifact: dist/pack/linux/

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - run: npm install

      - name: Build story and package for ${{ matrix.target }}
        run: npx vite build
        env:
          NODE_ENV: production
          SPINDLE_PACK_TARGETS: ${{ matrix.target }}

      - uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ matrix.target }}
          path: ${{ matrix.artifact }}

      - name: Attach to release
        if: github.event_name == 'release'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for file in ${{ matrix.artifact }}*; do
            gh release upload "${{ github.event.release.tag_name }}" "$file" --clobber
          done
```

**Note:** The workflow uses the `SPINDLE_PACK_TARGETS` env var, which the plugin already supports (added in Task 2's `closeBundle` implementation).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-desktop.yml
git commit -m "feat(pack): add desktop build workflow"
```

---

### Task 8: GitHub Actions — android workflow

**Files:**
- Create: `.github/workflows/build-android.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/build-android.yml`:

```yaml
name: Build Android APK

on:
  workflow_dispatch:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - run: npm install

      - name: Decode keystore
        if: env.KEYSTORE_BASE64 != ''
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: echo "$KEYSTORE_BASE64" | base64 -d > /tmp/release.keystore

      - name: Build story and package for Android
        run: npx vite build
        env:
          NODE_ENV: production
          SPINDLE_PACK_TARGETS: android
          SPINDLE_KEYSTORE_PATH: ${{ secrets.KEYSTORE_BASE64 && '/tmp/release.keystore' || '' }}
          SPINDLE_KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          SPINDLE_KEY_ALIAS: ${{ secrets.KEY_ALIAS || 'release' }}
          SPINDLE_KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}

      - uses: actions/upload-artifact@v4
        with:
          name: android-apk
          path: dist/pack/android/

      - name: Attach to release
        if: github.event_name == 'release'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for file in dist/pack/android/*.apk; do
            gh release upload "${{ github.event.release.tag_name }}" "$file" --clobber
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-android.yml
git commit -m "feat(pack): add android APK build workflow"
```

---

### Task 9: GitHub Actions — joiplay workflow

**Files:**
- Create: `.github/workflows/build-joiplay.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/build-joiplay.yml`:

```yaml
name: Build JoiPlay Package

on:
  workflow_dispatch:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm install

      - name: Build story and package for JoiPlay
        run: npx vite build
        env:
          NODE_ENV: production
          SPINDLE_PACK_TARGETS: joiplay

      - uses: actions/upload-artifact@v4
        with:
          name: joiplay-zip
          path: dist/pack/joiplay/

      - name: Attach to release
        if: github.event_name == 'release'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for file in dist/pack/joiplay/*.zip; do
            gh release upload "${{ github.event.release.tag_name }}" "$file" --clobber
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-joiplay.yml
git commit -m "feat(pack): add joiplay zip build workflow"
```

---

### Task 10: Gitignore and final integration

**Files:**
- Modify: `.gitignore`
- Modify: `vite.config.ts` (add commented example)

- [ ] **Step 1: Update .gitignore**

Add the following lines to `.gitignore`:

```
# Pack build artifacts
pack/tauri/src-tauri/target
pack/tauri/web-assets
pack/capacitor/node_modules
pack/capacitor/web-assets
pack/capacitor/android/app/build
pack/capacitor/android/.gradle
dist/pack
```

- [ ] **Step 2: Add commented plugin example to vite.config.ts**

Add a commented example at the top of `vite.config.ts` showing how to enable the plugin. Append after the existing imports but before the `spindlePlugin()` function:

```typescript
// To enable single-file executable packaging, uncomment and configure:
//
// import { spindlePack } from './pack/plugin.js';
//
// Then add to the plugins array (AFTER spindlePlugin()):
//
// spindlePack({
//   name: 'My Story',
//   identifier: 'com.author.mystory',
//   icon: 'src/assets/media/icon.png',
//   version: '1.0.0',
//   targets: ['windows', 'macos', 'linux', 'android', 'joiplay'],
// })
```

- [ ] **Step 3: Verify existing build still works**

```bash
cd /media/clemens/storage/git/twine/spindle-starter
npm run build
```

Expected: Build succeeds normally, produces `dist/index.html`. No `dist/pack/` directory (plugin not enabled).

- [ ] **Step 4: Commit**

```bash
git add .gitignore vite.config.ts
git commit -m "feat(pack): add gitignore rules and integration docs"
```
