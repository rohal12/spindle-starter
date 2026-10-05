import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'fs';
import { execSync, execFileSync } from 'child_process';
import { resolve, join } from 'path';
import type { BuildContext } from '../types.js';
import { copyDistAssets } from './copy-dist.js';

const CAP_DIR = resolve(import.meta.dirname!, '../capacitor');
const CAP_CLI = join(CAP_DIR, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const APK_DIR = join(CAP_DIR, 'android', 'app', 'build', 'outputs', 'apk');

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
    SPINDLE_APP_ID: ctx.config.identifier,
    SPINDLE_APP_NAME: ctx.config.name,
    ORG_GRADLE_PROJECT_spindleAppId: ctx.config.identifier,
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
  if (!existsSync(join(CAP_DIR, 'node_modules'))) {
    console.log('[spindle-pack] Installing Capacitor dependencies...');
    // No lockfile is committed (package-lock.json is gitignored), so npm ci can't be used
    execSync('npm install --no-audit --no-fund', { cwd: CAP_DIR, stdio: 'inherit' });
  }
}

/** Run the Capacitor CLI without a shell, so arguments (e.g. passwords) are passed verbatim. */
function cap(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, [CAP_CLI, ...args], { cwd: CAP_DIR, stdio: 'inherit', env });
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

  const env = buildEnv(ctx);

  // Sync web assets into the Android project
  cap(['sync', 'android'], env);

  // Clear APKs from earlier builds so findApk can't pick a stale one
  rmSync(APK_DIR, { recursive: true, force: true });

  // Check for signing config (CI provides these via env vars)
  const keystorePath = process.env.SPINDLE_KEYSTORE_PATH;
  const keystorePass = process.env.SPINDLE_KEYSTORE_PASSWORD;
  const keyAlias = process.env.SPINDLE_KEY_ALIAS || 'release';
  const keyPass = process.env.SPINDLE_KEY_PASSWORD || keystorePass;

  let buildType: 'debug' | 'release';
  if (keystorePath && keystorePass && keyPass) {
    // Signed release build
    console.log('[spindle-pack] Building signed release APK...');
    cap(
      [
        'build', 'android',
        '--keystorepath', keystorePath,
        '--keystorepass', keystorePass,
        '--keystorealias', keyAlias,
        '--keystorealiaspass', keyPass,
        '--androidreleasetype', 'APK',
      ],
      env
    );
    buildType = 'release';
  } else {
    // Debug build (unsigned, suitable for sideloading)
    console.log('[spindle-pack] Building debug APK (no keystore configured)...');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    execSync(`${gradlew} assembleDebug`, {
      cwd: join(CAP_DIR, 'android'),
      stdio: 'inherit',
      env,
    });
    buildType = 'debug';
  }

  // Collect output
  const apkPath = findApk(buildType);
  const outDir = join(ctx.outDir, 'android');
  mkdirSync(outDir, { recursive: true });

  const storyName = ctx.config.name.replace(/\s+/g, '-');
  cpSync(apkPath, join(outDir, `${storyName}.apk`));

  console.log('[spindle-pack] Android build complete.');
}
