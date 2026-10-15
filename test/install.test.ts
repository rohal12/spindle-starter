import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const postinstall = resolve('scripts/postinstall.mjs');
const setup = resolve('scripts/setup.mjs');
const roots: string[] = [];
const templateIfid = 'D674C58C-DEFA-4F70-B7A2-27742230C0FC';
const files = {
  'docs/my-game-notes.md': 'Keep my notes',
  'CHANGELOG.md': 'My releases',
  '.github/workflows/deploy-docs.yml': 'My docs workflow',
  '.github/workflows/trigger-demo.yml': 'My demo workflow',
  'package.json': JSON.stringify({
    scripts: { build: 'vite build', 'docs:build': 'vitepress build docs' },
    devDependencies: { vite: '*', vitepress: '*' },
  }),
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'spindle-install-'));
  roots.push(root);
  for (const [path, content] of Object.entries({ ...files, 'src/story/StoryData.twee': templateIfid })) {
    const filename = join(root, path);
    mkdirSync(join(filename, '..'), { recursive: true });
    writeFileSync(filename, content);
  }
  return root;
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function init(root: string): void {
  git(root, 'init', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture');
}

function checkInstall(root: string, gitProject: boolean, env = process.env): void {
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, [postinstall], { cwd: root, env });
    for (const [path, content] of Object.entries(files)) {
      expect(readFileSync(join(root, path), 'utf8')).toBe(content);
    }
    const ifid = readFileSync(join(root, 'src/story/StoryData.twee'), 'utf8');
    if (gitProject) expect(ifid).toBe(templateIfid);
    else {
      expect(ifid).not.toBe(templateIfid);
      // The generated identity stays stable across reinstalls.
      if (i === 0) writeFileSync(join(root, 'first-ifid'), ifid);
      else expect(ifid).toBe(readFileSync(join(root, 'first-ifid'), 'utf8'));
    }
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('reinstalls preserve customized files without Git', () => checkInstall(fixture(), false));
test('reinstalls preserve files even when Git is unavailable', () => {
  checkInstall(fixture(), false, { ...process.env, PATH: '' });
});
test('reinstalls preserve a normal Git project', () => {
  const root = fixture();
  init(root);
  checkInstall(root, true);
});
test('nested copies inside an unrelated Git repo get distinct stable story identities', () => {
  const parent = fixture();
  init(parent);
  const ifids: string[] = [];
  for (const name of ['first-story', 'second-story']) {
    const root = join(parent, 'games', name);
    for (const [path, content] of Object.entries({ ...files, 'src/story/StoryData.twee': templateIfid })) {
      const filename = join(root, path);
      mkdirSync(join(filename, '..'), { recursive: true });
      writeFileSync(filename, content);
    }
    checkInstall(root, false);
    ifids.push(readFileSync(join(root, 'src/story/StoryData.twee'), 'utf8'));
  }
  expect(ifids[0]).not.toBe(ifids[1]);
});
test('a customized story identity in a nested copy remains unchanged', () => {
  const root = fixture();
  const ownIfid = '12345678-1234-1234-1234-123456789ABC';
  writeFileSync(join(root, 'src/story/StoryData.twee'), ownIfid);
  execFileSync(process.execPath, [postinstall], { cwd: root });
  expect(readFileSync(join(root, 'src/story/StoryData.twee'), 'utf8')).toBe(ownIfid);
});
test('reinstalls preserve an actual linked worktree and untracked notes', () => {
  const root = fixture();
  init(root);
  const worktree = join(root, 'linked');
  git(root, 'worktree', 'add', '-b', 'story', worktree);
  writeFileSync(join(worktree, 'docs/untracked.md'), 'Untracked notes');
  checkInstall(worktree, true);
  expect(readFileSync(join(worktree, 'docs/untracked.md'), 'utf8')).toBe('Untracked notes');
});
test('reinstalls preserve an actual submodule', () => {
  const source = fixture();
  init(source);
  const parent = fixture();
  init(parent);
  git(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', source, 'story');
  checkInstall(join(parent, 'story'), true);
});
test('explicit setup removes template tooling and preserves an existing story identity', () => {
  const root = fixture();
  const ownIfid = '12345678-1234-1234-1234-123456789ABC';
  writeFileSync(join(root, 'src/story/StoryData.twee'), ownIfid);
  execFileSync(process.execPath, [setup], { cwd: root });
  expect(() => readFileSync(join(root, 'docs/my-game-notes.md'))).toThrow();
  expect(() => readFileSync(join(root, 'CHANGELOG.md'))).toThrow();
  for (const path of ['deploy-docs.yml', 'trigger-demo.yml']) {
    expect(() => readFileSync(join(root, '.github/workflows', path))).toThrow();
  }
  expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({
    scripts: { build: 'vite build' }, devDependencies: { vite: '*' },
  });
  expect(readFileSync(join(root, 'src/story/StoryData.twee'), 'utf8')).toBe(ownIfid);
});
