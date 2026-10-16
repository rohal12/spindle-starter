import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const project = resolve(import.meta.dirname, '..');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spindle-tauri-'));
  roots.push(root);
  for (const path of ['pack/scripts', 'pack/types.ts', 'pack/tauri/src-tauri/tauri.conf.json']) {
    cpSync(join(project, path), join(root, path), { recursive: true });
  }
  symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'), 'junction');
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), '<html>Current story</html>');
  const defaultDir = join(root, 'pack/tauri/src-tauri/target/release');
  mkdirSync(defaultDir, { recursive: true });
  writeFileSync(join(defaultDir, 'Story.exe'), 'OLD RELEASE');
  writeFileSync(join(defaultDir, 'spindle-story.exe'), 'OLD CARGO BINARY');
  writeFileSync(join(root, 'run.mts'), `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const srcTauri = resolve('pack/tauri/src-tauri');
const targetDir = resolve(srcTauri, process.env.CARGO_TARGET_DIR);
const releaseDir = join(targetDir, process.env.TEST_TRIPLE || '', 'release');
if (process.env.TEST_TRIPLE) {
  mkdirSync(join(targetDir, 'release'), { recursive: true });
  writeFileSync(join(targetDir, 'release/Story.exe'), 'STALE UNQUALIFIED BUILD');
}
const bundleDir = join(releaseDir, 'bundle', process.env.TEST_TARGET === 'macos' ? 'macos' : 'appimage');
const oldBundle = join(bundleDir, process.env.TEST_TARGET === 'macos' ? 'Old.app' : 'Old.AppImage');
mkdirSync(bundleDir, { recursive: true });
if (process.env.TEST_TARGET === 'macos') mkdirSync(oldBundle);
else writeFileSync(oldBundle, 'OLD BUNDLE');
childProcess.execSync = () => Buffer.from('rustc fixture');
childProcess.execFileSync = (command, args, options) => {
  if (command === 'cargo') {
    assert.deepEqual(args, ['metadata', '--no-deps', '--format-version', '1']);
    assert.equal(options.cwd, srcTauri);
    // Only external tooling is stubbed; collection and cleanup use real files.
    return JSON.stringify({ target_directory: targetDir });
  }
  if (command === 'zip') {
    assert.equal(options.cwd, bundleDir);
    assert.equal(args[2], 'Story.app');
    writeFileSync(args[1], readFileSync(join(options.cwd, args[2], 'contents')));
    return '';
  }
  // npx runs through npm's JS entry point on Windows.
  assert.ok(command === 'npx' || command === process.execPath);
  if (command === process.execPath) args = args.slice(1);
  assert.equal(options.cwd, resolve('pack/tauri'));
  if (args[1] === 'build' || args[1] === 'bundle') {
    const targetIndex = args.indexOf('--target');
    if (process.env.TEST_TRIPLE) {
      assert.notEqual(targetIndex, -1, 'native build and bundle must receive the selected target');
      assert.equal(args[targetIndex + 1], process.env.TEST_TRIPLE);
    } else assert.equal(targetIndex, -1, 'unconfigured builds keep the default output layout');
  }
  const overlay = JSON.parse(readFileSync('pack/tauri/pack.conf.json', 'utf8'));
  if (args[1] === 'build') {
    mkdirSync(releaseDir, { recursive: true });
    // Leave an unrelated executable that must never be collected as the story.
    writeFileSync(join(releaseDir, 'unrelated.exe'), 'UNRELATED');
    if (!process.env.TEST_MISSING_EXE) writeFileSync(join(releaseDir, (overlay.mainBinaryName ?? 'spindle-story') + '.exe'), 'FRESH NATIVE BUILD');
  } else if (args[1] === 'bundle') {
    assert.equal(existsSync(oldBundle), false, 'previous custom-directory bundles must be removed');
    mkdirSync(bundleDir, { recursive: true });
    if (process.env.TEST_TARGET === 'macos') {
      mkdirSync(join(bundleDir, 'Story.app'));
      writeFileSync(join(bundleDir, 'Story.app/contents'), 'FRESH NATIVE BUILD');
    } else writeFileSync(join(bundleDir, 'Story.AppImage'), 'FRESH NATIVE BUILD');
  } else assert.equal(args[1], 'icon');
  return '';
};
syncBuiltinESMExports();
const { buildTauri } = await import('./pack/scripts/build-tauri.ts');
await buildTauri(process.env.TEST_TARGET, {
  projectRoot: process.cwd(), distDir: resolve('dist'), outDir: resolve('dist/pack'),
  config: { name: 'Story', identifier: 'com.example.story', version: '1.0.0', icon: '', targets: [process.env.TEST_TARGET] },
});
`);
  return { root, defaultDir };
}

function build(root: string, target: string, options: { missingExe?: boolean; triple?: string; envTarget?: string; defaultHome?: boolean } = {}) {
  return execFileSync(process.execPath, ['--import', 'tsx', 'run.mts'], {
    cwd: root,
    // Cargo resolves relative environment overrides from src-tauri.
    env: { ...process.env, CARGO_TARGET_DIR: 'custom target $ %NAME%', TEST_TARGET: target,
      CARGO_HOME: options.defaultHome ? undefined : join(root, 'cargo-home'),
      HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), CARGO_BUILD_TARGET: options.envTarget ?? '',
      TEST_TRIPLE: options.triple ?? '', TEST_MISSING_EXE: options.missingExe ? '1' : '' },
    stdio: 'pipe',
    timeout: 30000,
  });
}

test.each([
  ['windows', 'Story.exe'], ['linux', 'Story.AppImage'], ['macos', 'Story.app.zip'],
])('collects the current %s build from Cargo metadata, including bundle cleanup', (target, artifact) => {
  const { root, defaultDir } = fixture();
  build(root, target);
  expect(readFileSync(join(root, 'dist/pack', target, artifact), 'utf8')).toBe('FRESH NATIVE BUILD');
  expect(readFileSync(join(defaultDir, 'Story.exe'), 'utf8')).toBe('OLD RELEASE');
});

test('fails when the expected Windows binary is missing, even with older or unrelated executables', () => {
  const { root } = fixture();
  expect(() => build(root, 'windows', { missingExe: true })).toThrow(/Could not find Windows executable/);
  expect(existsSync(join(root, 'dist/pack/windows/Story.exe'))).toBe(false);
});

function cargoConfig(root: string, path: string, contents: string) {
  const dir = join(root, path);
  mkdirSync(resolve(dir, '..'), { recursive: true });
  writeFileSync(dir, contents);
}

test.each([
  ['windows', 'Story.exe', 'x86_64-pc-windows-msvc'],
  ['linux', 'Story.AppImage', 'x86_64-unknown-linux-gnu'],
  ['macos', 'Story.app.zip', 'aarch64-apple-darwin'],
])('collects the current %s build with an environment target', (target, artifact, triple) => {
  const { root } = fixture();
  build(root, target, { triple, envTarget: triple });
  expect(readFileSync(join(root, 'dist/pack', target, artifact), 'utf8')).toBe('FRESH NATIVE BUILD');
});

test.each([
  ['pack/tauri/src-tauri/.cargo/config.toml', '[build]\ntarget = "x86_64-pc-windows-msvc"'],
  ['.cargo/config.toml', 'build.target = "x86_64-pc-windows-msvc"'],
  ['.cargo/config', "[build]\ntarget = 'x86_64-pc-windows-msvc'"],
  ['cargo-home/config.toml', '[build]\ntarget = [\n"x86_64-pc-windows-msvc",\n"aarch64-pc-windows-msvc",\n]'],
])('collects a configured target from %s', (path, contents) => {
  const { root } = fixture();
  cargoConfig(root, path, contents);
  build(root, 'windows', { triple: 'x86_64-pc-windows-msvc' });
  expect(readFileSync(join(root, 'dist/pack/windows/Story.exe'), 'utf8')).toBe('FRESH NATIVE BUILD');
});

test('environment targets override config and select the first whitespace-separated target', () => {
  const { root } = fixture();
  cargoConfig(root, '.cargo/config.toml', '[build]\ntarget = "wrong-target"');
  build(root, 'windows', { triple: 'x86_64-pc-windows-msvc',
    envTarget: '  x86_64-pc-windows-msvc\taarch64-pc-windows-msvc ' });
  expect(readFileSync(join(root, 'dist/pack/windows/Story.exe'), 'utf8')).toBe('FRESH NATIVE BUILD');
});

test('the nearest target config wins, preferring legacy config over config.toml', () => {
  const { root } = fixture();
  cargoConfig(root, '.cargo/config.toml', '[build]\ntarget = "wrong-ancestor"');
  cargoConfig(root, 'pack/tauri/src-tauri/.cargo/config.toml', '[build]\ntarget = "wrong-extension"');
  cargoConfig(root, 'pack/tauri/src-tauri/.cargo/config', '[build]\ntarget = "x86_64-pc-windows-msvc"');
  cargoConfig(root, 'cargo-home/config.toml', '[build]\ntarget = "wrong-global"');
  build(root, 'windows', { triple: 'x86_64-pc-windows-msvc' });
  expect(readFileSync(join(root, 'dist/pack/windows/Story.exe'), 'utf8')).toBe('FRESH NATIVE BUILD');
});

test('collects a target configured in the default Cargo home without CARGO_HOME', () => {
  const { root } = fixture();
  cargoConfig(root, 'home/.cargo/config.toml', '[build]\ntarget = "x86_64-pc-windows-msvc"');
  build(root, 'windows', { triple: 'x86_64-pc-windows-msvc', defaultHome: true });
  expect(readFileSync(join(root, 'dist/pack/windows/Story.exe'), 'utf8')).toBe('FRESH NATIVE BUILD');
});
