import { cpSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, expect, test, vi } from 'vitest';
import { buildTauri } from '../pack/scripts/build-tauri.js';
import type { BuildContext } from '../pack/types.js';

vi.mock('fs', () => ({
  cpSync: vi.fn(), mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn(),
  existsSync: vi.fn(), readdirSync: vi.fn(),
}));
vi.mock('child_process', () => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('../pack/scripts/exec.js', () => ({ npx: vi.fn() }));
vi.mock('../pack/scripts/icon.js', () => ({ resolveIcon: () => 'icon.png' }));
vi.mock('../pack/scripts/copy-dist.js', () => ({ copyDistAssets: vi.fn() }));
afterEach(() => vi.resetAllMocks());

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
    const executable = resolve('pack/tauri/src-tauri/target/release', `${safe.toLowerCase()}.exe`);
    vi.mocked(existsSync).mockImplementation((path) => path === executable);
    await buildTauri('windows', ctx);
    const [, overlay] = vi.mocked(writeFileSync).mock.calls[0];
    expect(JSON.parse(String(overlay))).toMatchObject({
      productName: safe,
      app: { windows: [{ title: name, width: 960, height: 600, create: false }] },
    });
    expect(cpSync).toHaveBeenCalledWith(executable, join(ctx.outDir, 'windows', `${safe}.exe`));
    expect(readdirSync).not.toHaveBeenCalled();
  },
);
