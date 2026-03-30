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
