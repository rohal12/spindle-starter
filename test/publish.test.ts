import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { spindlePublish, type SpindlePublishConfig } from '../publish/plugin.js';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
const real = await vi.importActual<typeof import('child_process')>('child_process');
let root: string;
let dispatches: string[][];

function git(...args: string[]): string {
  return real.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
async function publish(config?: SpindlePublishConfig): Promise<void> {
  const hook = spindlePublish(config).closeBundle as { handler: () => Promise<void> };
  await hook.handler();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spindle-publish-'));
  git('init', '-b', 'main');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'fixture');
  git('remote', 'add', 'origin', 'https://github.com/example/game.git');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('branch', '--set-upstream-to=origin/main');
  dispatches = [];
  vi.stubEnv('SPINDLE_PUBLISH', 'pages');
  vi.mocked(execFileSync).mockImplementation(((command: string, args: string[], options: object) => {
    if (command === 'git') return real.execFileSync(command, args, { ...options, cwd: root });
    if (command === 'gh') {
      if (args[0] === 'workflow') dispatches.push(args);
      return '';
    }
    throw new Error(`Unexpected command: ${command}`);
  }) as typeof execFileSync);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  rmSync(root, { recursive: true, force: true });
});

test('a renamed local branch dispatches its tracked branch, not an unrelated remote story branch', async () => {
  git('branch', '-m', 'story');
  await publish();
  expect(dispatches).toEqual([['workflow', 'run', 'deploy-pages.yml', '--repo', 'example/game', '--ref', 'main']]);
});
test('dispatch uses the tracked remote repository and nested branch name', async () => {
  git('remote', 'add', 'project', 'git@github.com:author/story.git');
  git('update-ref', 'refs/remotes/project/release/web', 'HEAD');
  git('branch', '--set-upstream-to=project/release/web');
  await publish();
  expect(dispatches[0]).toEqual(['workflow', 'run', 'deploy-pages.yml', '--repo', 'author/story', '--ref', 'release/web']);
});
test('unpushed commits cannot trigger deployment', async () => {
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'unpushed');
  await expect(publish()).rejects.toThrow('unpushed commit');
  expect(dispatches).toEqual([]);
});
test('uncommitted files cannot trigger deployment', async () => {
  writeFileSync(join(root, 'notes.md'), 'notes');
  await expect(publish()).rejects.toThrow('uncommitted changes');
  expect(dispatches).toEqual([]);
});
test('a branch without an upstream cannot trigger deployment', async () => {
  git('branch', '--unset-upstream');
  await expect(publish()).rejects.toThrow('has no upstream');
  expect(dispatches).toEqual([]);
});

test.each([
  ['beta', 'html5', 'beta'],
  [undefined, 'preview', 'preview'],
  [undefined, undefined, 'html5'],
])('itch channel env=%s config=%s uploads to %s', async (env, configured, expected) => {
  vi.stubEnv('SPINDLE_PUBLISH', 'itch');
  vi.stubEnv('ITCH_CHANNEL', env);
  vi.mocked(execFileSync).mockReturnValue('');
  await publish({ itch: { user: 'example', game: 'game', channel: configured } });
  expect(execFileSync).toHaveBeenCalledWith('butler',
    ['push', 'dist/', `example/game:${expected}`, '--ignore', 'pack'], { stdio: 'inherit' });
});

test.each([['pages'], ['itch', '--channel', 'beta'], ['itch', '--channel=preview']])(
  'web publish wrapper skips configured native builds: %j', (...args) => {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(resolve('scripts/publish.mjs'), join(root, 'scripts/publish.mjs'));
    mkdirSync(join(root, 'node_modules/vite/bin'), { recursive: true });
    const result = join(root, 'build-env.json');
    // Recording Vite entry point exercises the real wrapper without publishing.
    writeFileSync(join(root, 'node_modules/vite/bin/vite.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(result)}, JSON.stringify({
        target: process.env.SPINDLE_PUBLISH, pack: process.env.SPINDLE_PACK_TARGETS,
        channel: process.env.ITCH_CHANNEL, args: process.argv.slice(2) }));`);
    real.execFileSync(process.execPath, [join(root, 'scripts/publish.mjs'), ...args], {
      cwd: root, env: { ...process.env, SPINDLE_PACK_TARGETS: 'android,windows' },
    });
    expect(JSON.parse(readFileSync(result, 'utf8'))).toMatchObject({
      target: args[0], pack: 'none', args: ['build'],
      ...(args[0] === 'itch' ? { channel: args[1]?.includes('=') ? 'preview' : 'beta' } : {}),
    });
  },
);
