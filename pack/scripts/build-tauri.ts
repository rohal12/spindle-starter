import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync } from 'child_process';
import { resolve, join, dirname, basename } from 'path';
import type { BuildContext, Target } from '../types.js';
import { copyDistAssets } from './copy-dist.js';
import { tauriIdentifier } from './identifier.js';

const TAURI_DIR = resolve(import.meta.dirname!, '../tauri');
const SRC_TAURI = join(TAURI_DIR, 'src-tauri');
/** Generated config overlay, merged over tauri.conf.json via --config (gitignored) */
const PACK_CONFIG = join(TAURI_DIR, 'pack.conf.json');
/** Icon used when the configured icon doesn't exist */
const FALLBACK_ICON = 'src/assets/media/favicon.svg';

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

/**
 * Write the story's settings to a separate overlay file instead of editing the
 * tracked tauri.conf.json. Tauri merges it in via JSON Merge Patch, which
 * replaces arrays wholesale, so the window entry is written out in full.
 */
function writePackConfig(ctx: BuildContext): void {
  const config = {
    productName: ctx.config.name,
    version: ctx.config.version,
    identifier: tauriIdentifier(ctx.config.identifier),
    app: {
      windows: [
        {
          title: ctx.config.name,
          ...ctx.config.window,
        },
      ],
    },
  };

  writeFileSync(PACK_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

function copyWebAssets(ctx: BuildContext): void {
  copyDistAssets(ctx, join(TAURI_DIR, 'web-assets'));
}

/** Generate src-tauri/icons/, which tauri.conf.json requires for every build. */
function generateIcons(ctx: BuildContext): void {
  let icon = resolve(ctx.projectRoot, ctx.config.icon);
  if (!existsSync(icon)) {
    console.warn(
      `[spindle-pack] Icon not found: ${ctx.config.icon}, using ${FALLBACK_ICON}`
    );
    icon = resolve(ctx.projectRoot, FALLBACK_ICON);
  }

  console.log('[spindle-pack] Generating app icons...');
  execSync(`npx @tauri-apps/cli@2 icon "${icon}"`, {
    cwd: TAURI_DIR,
    stdio: 'inherit',
  });
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

    case 'macos': {
      // Zip the .app directory with relative paths for clean extraction.
      // zip -r adds to an existing archive, so remove any previous one first.
      const zipPath = join(targetDir, `${storyName}.app.zip`);
      rmSync(zipPath, { force: true });
      execSync(`zip -r "${zipPath}" "${basename(outputPath)}"`, {
        cwd: dirname(outputPath),
        stdio: 'inherit',
      });
      break;
    }

    case 'linux':
      cpSync(outputPath, join(targetDir, `${storyName}.AppImage`));
      break;
  }
}

export async function buildTauri(target: Target, ctx: BuildContext): Promise<void> {
  console.log(`[spindle-pack] Building ${target} executable via Tauri...`);

  checkPrerequisites();
  copyWebAssets(ctx);
  writePackConfig(ctx);
  generateIcons(ctx);

  const bundleFlag = getBundleFlag(target);

  // Build the binary without bundling first
  execSync(`npx @tauri-apps/cli@2 build --no-bundle --config "${PACK_CONFIG}"`, {
    cwd: TAURI_DIR,
    stdio: 'inherit',
  });

  // For macOS and Linux, run the bundler to produce .app / .AppImage
  // For Windows, skip bundling — we use the portable .exe directly
  if (bundleFlag) {
    // Clear bundles from earlier builds so findOutput can't pick a stale one
    rmSync(join(SRC_TAURI, 'target', 'release', 'bundle', bundleFlag === 'app' ? 'macos' : bundleFlag), {
      recursive: true,
      force: true,
    });
    execSync(
      `npx @tauri-apps/cli@2 bundle --bundles ${bundleFlag} --config "${PACK_CONFIG}"`,
      { cwd: TAURI_DIR, stdio: 'inherit' }
    );
  }

  const outputPath = findOutput(target, ctx);
  collectOutput(target, outputPath, ctx);

  console.log(`[spindle-pack] ${target} build complete.`);
}
