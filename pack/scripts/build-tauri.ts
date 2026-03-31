import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync } from 'child_process';
import { resolve, join, dirname, basename } from 'path';
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
    `npx @tauri-apps/cli@2 icon "${resolve(ctx.config.icon)}"`,
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
      // Zip the .app directory with relative paths for clean extraction
      execSync(
        `zip -r "${join(targetDir, `${storyName}.app.zip`)}" "${basename(outputPath)}"`,
        { cwd: dirname(outputPath), stdio: 'inherit' }
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
  execSync('npx @tauri-apps/cli@2 build --no-bundle', {
    cwd: TAURI_DIR,
    stdio: 'inherit',
    env: { ...process.env },
  });

  // For macOS and Linux, run the bundler to produce .app / .AppImage
  // For Windows, skip bundling — we use the portable .exe directly
  if (bundleFlag) {
    execSync(`npx @tauri-apps/cli@2 bundle --bundles ${bundleFlag}`, {
      cwd: TAURI_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });
  }

  const outputPath = findOutput(target, ctx);
  collectOutput(target, outputPath, ctx);

  console.log(`[spindle-pack] ${target} build complete.`);
}
