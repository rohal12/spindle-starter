import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { afterEach, expect, test, vi } from 'vitest';
import { npx } from '../pack/scripts/exec.js';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('fs', () => ({ existsSync: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

const args = ['@tauri-apps/cli@2', 'icon', 'C:/My %USERNAME% Story/icon$2 %TEMP%.png'];
const cwd = 'C:/My %USERNAME% Story';

test('Windows passes percent, dollar and space-containing paths to npx without a shell', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.stubEnv('npm_execpath', 'C:/Node/npm/bin/npm-cli.js');
  const cli = join('C:/Node/npm/bin', 'npx-cli.js');
  vi.mocked(existsSync).mockImplementation((path) => path === cli);
  npx(args, cwd);
  expect(execFileSync).toHaveBeenCalledExactlyOnceWith(process.execPath,
    [cli, ...args], { cwd, stdio: 'inherit' });
});
test('Windows fails clearly when npm CLI cannot be located, without falling back to shell expansion', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.mocked(existsSync).mockReturnValue(false);
  expect(() => npx(args, cwd)).toThrow('Run the build with npm run build');
  expect(execFileSync).not.toHaveBeenCalled();
});
test('POSIX also passes all arguments literally', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  npx(args, cwd);
  expect(execFileSync).toHaveBeenCalledExactlyOnceWith('npx', args, { cwd, stdio: 'inherit' });
});
