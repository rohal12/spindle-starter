import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync, execFileSync } from 'child_process';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { BuildContext } from '../types.js';
import { copyDistAssets } from './copy-dist.js';
import { androidApplicationId, artifactName } from './identifier.js';
import { npx } from './exec.js';
import { resolveIcon } from './icon.js';

const CAP_DIR = resolve(import.meta.dirname!, '../capacitor');
const CAP_CLI = join(CAP_DIR, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const ANDROID_DIR = join(CAP_DIR, 'android');
const APK_DIR = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk');
/** Launcher icons generated from the configured icon (gitignored); see android/app/build.gradle */
const GENERATED_RES = join(ANDROID_DIR, 'app', 'generated-res');

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

/**
 * Story settings are passed through the environment rather than written into
 * tracked files: capacitor.config.ts reads SPINDLE_APP_*, and Gradle picks up
 * ORG_GRADLE_PROJECT_* as project properties (see android/app/build.gradle).
 */
function buildEnv(ctx: BuildContext): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SPINDLE_APP_ID: androidApplicationId(ctx.config.identifier),
    SPINDLE_APP_NAME: ctx.config.name,
    ORG_GRADLE_PROJECT_spindleAppId: androidApplicationId(ctx.config.identifier),
    ORG_GRADLE_PROJECT_spindleAppName: escapeAndroidString(ctx.config.name),
    ORG_GRADLE_PROJECT_spindleVersion: ctx.config.version,
  };
}

/**
 * Gradle's resValue XML-escapes the value (& and <) but not Android's own
 * string syntax, so apostrophes, quotes, backslashes and a leading @ or ?
 * must be escaped here or aapt rejects the resource.
 */
function escapeAndroidString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/^([@?])/, '\\$1');
}

function installDeps(): void {
  // The directory alone proves nothing: an interrupted install leaves it behind
  // without the CLI, and every later build would fail on the missing file.
  if (!existsSync(CAP_CLI)) {
    console.log('[spindle-pack] Installing Capacitor dependencies...');
    // No lockfile is committed (package-lock.json is gitignored), so npm ci can't be used
    execSync('npm install --no-audit --no-fund', { cwd: CAP_DIR, stdio: 'inherit' });
    if (!existsSync(CAP_CLI)) {
      throw new Error(
        `[spindle-pack] Capacitor CLI is still missing after installing. ` +
        `Delete ${join(CAP_DIR, 'node_modules')} and build again.`
      );
    }
  }
}

/** Run the Capacitor CLI without a shell, so arguments are passed verbatim. */
function cap(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, [CAP_CLI, ...args], { cwd: CAP_DIR, stdio: 'inherit', env });
}

/** Run a Gradle task in the generated Android project. */
function gradle(task: string, env: NodeJS.ProcessEnv): void {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  execSync(`${gradlew} ${task}`, { cwd: ANDROID_DIR, stdio: 'inherit', env });
}

/**
 * Turn the configured icon into Android launcher resources (all densities plus
 * the adaptive icon), using the same generator as the desktop builds. They go
 * to a gitignored directory that build.gradle layers over the template's
 * placeholder icons, so no tracked file changes.
 */
function generateLauncherIcons(ctx: BuildContext): void {
  console.log('[spindle-pack] Generating Android launcher icons...');
  rmSync(GENERATED_RES, { recursive: true, force: true });

  const tmp = mkdtempSync(join(tmpdir(), 'spindle-icons-'));
  try {
    npx(['@tauri-apps/cli@2', 'icon', resolveIcon(ctx), '--output', tmp], CAP_DIR);
    cpSync(join(tmp, 'android'), GENERATED_RES, { recursive: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function findApk(buildType: 'debug' | 'release'): string {
  const dir = join(APK_DIR, buildType);
  if (existsSync(dir)) {
    // A signed release build leaves an unsigned APK next to the signed one
    const apks = readdirSync(dir).filter((f) => f.endsWith('.apk') && !f.includes('unsigned'));
    if (apks.length > 0) return join(dir, apks[0]);
  }

  throw new Error(`[spindle-pack] Could not find ${buildType} APK in ${dir}`);
}

export async function buildCapacitor(ctx: BuildContext): Promise<void> {
  console.log('[spindle-pack] Building Android APK via Capacitor...');

  checkPrerequisites();
  installDeps();
  copyDistAssets(ctx, join(CAP_DIR, 'web-assets'));
  generateLauncherIcons(ctx);

  const env = buildEnv(ctx);

  // Sync web assets into the Android project
  cap(['sync', 'android'], env);

  // Clear APKs from earlier builds so findApk can't pick a stale one
  rmSync(APK_DIR, { recursive: true, force: true });

  // Signing config (CI provides these via env vars). The keystore passwords
  // are handed to Gradle as ORG_GRADLE_PROJECT_* environment variables that
  // android/app/build.gradle reads, never as command-line arguments: those end
  // up in `ps` output and in Node's "Command failed: ..." error message.
  const keystorePath = process.env.SPINDLE_KEYSTORE_PATH;
  const keystorePass = process.env.SPINDLE_KEYSTORE_PASSWORD;
  const keyAlias = process.env.SPINDLE_KEY_ALIAS || 'release';
  const keyPass = process.env.SPINDLE_KEY_PASSWORD || keystorePass;

  let buildType: 'debug' | 'release';
  if (keystorePath && keystorePass && keyPass) {
    console.log('[spindle-pack] Building signed release APK...');
    gradle('assembleRelease', {
      ...env,
      ORG_GRADLE_PROJECT_spindleKeystorePath: resolve(keystorePath),
      ORG_GRADLE_PROJECT_spindleKeystorePassword: keystorePass,
      ORG_GRADLE_PROJECT_spindleKeyAlias: keyAlias,
      ORG_GRADLE_PROJECT_spindleKeyPassword: keyPass,
    });
    buildType = 'release';
  } else {
    console.warn(
      '[spindle-pack] No keystore configured (SPINDLE_KEYSTORE_PATH, SPINDLE_KEYSTORE_PASSWORD): ' +
      'building a debug APK. Debug builds are signed with a throwaway key, so a later build ' +
      'cannot be installed over this one without uninstalling the game first, which deletes ' +
      'its saves. Sign releases with a keystore you keep.'
    );
    gradle('assembleDebug', env);
    buildType = 'debug';
  }

  // Collect output
  const apkPath = findApk(buildType);
  const outDir = join(ctx.outDir, 'android');
  mkdirSync(outDir, { recursive: true });

  cpSync(apkPath, join(outDir, `${artifactName(ctx.config.name)}.apk`));

  console.log('[spindle-pack] Android build complete.');
}
