import { cpSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { buildTauri } from '../pack/scripts/build-tauri.js';
import type { BuildContext } from '../pack/types.js';

vi.mock('fs', () => ({
  cpSync: vi.fn(), mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn(),
  existsSync: vi.fn(), readdirSync: vi.fn(), readFileSync: vi.fn(),
}));
vi.mock('child_process', () => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('../pack/scripts/exec.js', () => ({ npx: vi.fn() }));
vi.mock('../pack/scripts/icon.js', () => ({ resolveIcon: () => 'icon.png' }));
vi.mock('../pack/scripts/copy-dist.js', () => ({ copyDistAssets: vi.fn() }));
beforeEach(() => {
  vi.stubEnv('CARGO_BUILD_TARGET', '');
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify({
    target_directory: resolve('pack/tauri/src-tauri/target'),
  }));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

test.each(['Love/Hate', 'Part II: Awakening', 'What? "Now"', 'CON.txt'])(
  'desktop build sanitizes product name while keeping the window title: %s', async (name) => {
    const safeNames: Record<string, string> = {
      'Love/Hate': 'Love-Hate', 'Part II: Awakening': 'Part-II-Awakening',
      'What? "Now"': 'What-Now', 'CON.txt': '_CON.txt',
    };
    const safe = safeNames[name];
    const ctx: BuildContext = {
      projectRoot: '/story', distDir: '/story/dist', outDir: '/story/dist/pack',
      config: { name, identifier: 'com.example.story', version: '1.0.0', icon: '',
        targets: ['windows'], window: { width: 960, height: 600 } },
    };
    const executable = resolve('pack/tauri/src-tauri/target/release', `${safe}.exe`);
    vi.mocked(existsSync).mockImplementation((path) => path === executable);
    await buildTauri('windows', ctx);
    const [, overlay] = vi.mocked(writeFileSync).mock.calls[0];
    expect(JSON.parse(String(overlay))).toMatchObject({
      productName: safe,
      mainBinaryName: safe,
      app: { windows: [{ title: name, width: 960, height: 600, create: false }] },
    });
    expect(cpSync).toHaveBeenCalledWith(executable, join(ctx.outDir, 'windows', `${safe}.exe`));
    expect(readdirSync).not.toHaveBeenCalled();
  },
);

test.each([undefined, '', 'target'])(
  'rejects invalid Cargo target_directory metadata instead of falling back: %s', async (targetDirectory) => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ target_directory: targetDirectory }));
    await expect(buildTauri('windows', {} as BuildContext)).rejects.toThrow('absolute target_directory');
    expect(cpSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  },
);

test('propagates Cargo metadata failures before copying or building', async () => {
  vi.mocked(execFileSync).mockImplementation(() => { throw new Error('Cargo configuration error'); });
  await expect(buildTauri('windows', {} as BuildContext)).rejects.toThrow('Cargo configuration error');
  expect(cpSync).not.toHaveBeenCalled();
  expect(writeFileSync).not.toHaveBeenCalled();
});
