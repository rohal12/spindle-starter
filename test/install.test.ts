import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  'UNLICENSE': 'Starter license',
  '.github/workflows/ci.yml': 'Starter CI workflow',
  '.github/workflows/codeql.yml': 'Starter CodeQL workflow',
  '.github/workflows/dependabot-auto-merge.yml': 'Starter Dependabot auto-merge',
  '.github/workflows/dependencies.yml': 'Starter dependency submission',
  '.github/workflows/deploy-docs.yml': 'My docs workflow',
  '.github/workflows/gradle-wrapper.yml': 'Starter wrapper validation',
  '.github/workflows/pack.yml': 'Starter packaging check',
  '.github/workflows/scorecard.yml': 'Starter Scorecard workflow',
  '.github/workflows/trigger-demo.yml': 'My demo workflow',
  '.github/workflows/zizmor.yml': 'Starter workflow lint',
  '.github/workflows/deploy-pages.yml': 'My Pages workflow',
  '.github/SECURITY.md': 'Starter security policy',
  '.github/dependabot.yml': 'My Dependabot settings',
  'package.json': JSON.stringify({
    license: 'Unlicense',
    scripts: { build: 'vite build', 'docs:build': 'vitepress build docs' },
    devDependencies: { vite: '*', vitepress: '*' },
    overrides: { vitepress: { vite: '*' } },
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
  expect(() => readFileSync(join(root, 'UNLICENSE'))).toThrow();
  const starterWorkflows = [
    'ci.yml', 'codeql.yml', 'dependabot-auto-merge.yml', 'dependencies.yml', 'deploy-docs.yml',
    'gradle-wrapper.yml', 'pack.yml', 'scorecard.yml', 'trigger-demo.yml', 'zizmor.yml',
  ];
  for (const path of starterWorkflows) {
    expect(() => readFileSync(join(root, '.github/workflows', path))).toThrow();
  }
  expect(() => readFileSync(join(root, '.github/SECURITY.md'))).toThrow();
  expect(readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8')).toBe('My Pages workflow');
  expect(readFileSync(join(root, '.github/dependabot.yml'), 'utf8')).toBe('My Dependabot settings');
  expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({
    scripts: { build: 'vite build' }, devDependencies: { vite: '*' },
  });
  expect(readFileSync(join(root, 'src/story/StoryData.twee'), 'utf8')).toBe(ownIfid);
});

test('explicit setup keeps the lockfile in step with package.json without installing', () => {
  const root = fixture();
  const entry = (name: string, version: string, extra = {}) => ({
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: `sha512-${'A'.repeat(86)}==`,
    dev: true,
    ...extra,
  });
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { license: 'Unlicense', devDependencies: { vite: '*', vitepress: '*' } },
      'node_modules/vite': entry('vite', '8.3.4'),
      'node_modules/vitepress': entry('vitepress', '1.6.4', { dependencies: { vite: '*', 'docs-only': '*' } }),
      'node_modules/docs-only': entry('docs-only', '1.0.0'),
    },
  }));
  // Everything it needs is in the lockfile, so it must work offline
  execFileSync(process.execPath, [setup], { cwd: root, env: { ...process.env, npm_config_offline: 'true' }, stdio: 'pipe' });
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  expect(lock.packages['']).toMatchObject({ devDependencies: { vite: '*' } });
  expect(lock.packages[''].devDependencies.vitepress).toBeUndefined();
  expect(lock.packages[''].license).toBeUndefined();
  expect(Object.keys(lock.packages).sort()).toEqual(['', 'node_modules/vite']);
  expect(lock.packages['node_modules/vite'].version).toBe('8.3.4');
  expect(() => readdirSync(join(root, 'node_modules'))).toThrow();
});
