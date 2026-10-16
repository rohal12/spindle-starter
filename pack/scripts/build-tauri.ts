import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync, execFileSync } from 'child_process';
import { resolve, join, dirname, basename, isAbsolute } from 'path';
import type { BuildContext, Target } from '../types.js';
import { copyDistAssets } from './copy-dist.js';
import { tauriIdentifier, artifactName } from './identifier.js';
import { npx } from './exec.js';
import { resolveIcon } from './icon.js';

const TAURI_DIR = resolve(import.meta.dirname!, '../tauri');
const SRC_TAURI = join(TAURI_DIR, 'src-tauri');
/** Generated config overlay, merged over tauri.conf.json via --config (gitignored) */
const PACK_CONFIG = join(TAURI_DIR, 'pack.conf.json');

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
      return null; // No bundling — collect the portable .exe
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
    productName: artifactName(ctx.config.name),
    // Give the collector an exact filename instead of guessing among old .exes.
    mainBinaryName: artifactName(ctx.config.name),
    version: ctx.config.version,
    identifier: tauriIdentifier(ctx.config.identifier),
    app: {
      windows: [
        {
          title: ctx.config.name,
          ...ctx.config.window,
          // Rust creates the window from this config with native handlers attached.
          create: false,
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
  console.log('[spindle-pack] Generating app icons...');
  npx(['@tauri-apps/cli@2', 'icon', resolveIcon(ctx)], TAURI_DIR);
}

function resolveReleaseDir(): string {
  // Match Tauri's Cargo working directory so relative environment overrides and
  // .cargo/config.toml settings resolve the same way as the native build.
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: SRC_TAURI,
    encoding: 'utf8',
  }));
  if (typeof metadata.target_directory !== 'string' || !isAbsolute(metadata.target_directory)) {
    throw new Error('[spindle-pack] Cargo metadata did not return an absolute target_directory');
  }
  // The commands below always use the release profile, without --target.
  return join(metadata.target_directory, 'release');
}

function findOutput(target: Target, ctx: BuildContext, releaseDir: string): string {
  const bundleDir = join(releaseDir, 'bundle');

  switch (target) {
    case 'windows': {
      // Tauri renames the current main binary to the overlay's mainBinaryName.
      const exe = join(releaseDir, `${artifactName(ctx.config.name)}.exe`);
      if (existsSync(exe)) return exe;
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

  const storyName = artifactName(ctx.config.name);

  switch (target) {
    case 'windows':
      cpSync(outputPath, join(targetDir, `${storyName}.exe`));
      break;

    case 'macos': {
      // Zip the .app directory with relative paths for clean extraction.
      // zip -r adds to an existing archive, so remove any previous one first.
      const zipPath = join(targetDir, `${storyName}.app.zip`);
      rmSync(zipPath, { force: true });
      execFileSync('zip', ['-r', zipPath, basename(outputPath)], {
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
  const releaseDir = resolveReleaseDir();
  copyWebAssets(ctx);
  writePackConfig(ctx);
  generateIcons(ctx);

  const bundleFlag = getBundleFlag(target);

  // Build the binary without bundling first
  npx(['@tauri-apps/cli@2', 'build', '--no-bundle', '--config', PACK_CONFIG], TAURI_DIR);

  // For macOS and Linux, run the bundler to produce .app / .AppImage
  // For Windows, skip bundling — we use the portable .exe directly
  if (bundleFlag) {
    // Clear bundles from earlier builds so findOutput can't pick a stale one
    rmSync(join(releaseDir, 'bundle', bundleFlag === 'app' ? 'macos' : bundleFlag), {
      recursive: true,
      force: true,
    });
    npx(['@tauri-apps/cli@2', 'bundle', '--bundles', bundleFlag, '--config', PACK_CONFIG], TAURI_DIR);
  }

  const outputPath = findOutput(target, ctx, releaseDir);
  collectOutput(target, outputPath, ctx);

  console.log(`[spindle-pack] ${target} build complete.`);
}
