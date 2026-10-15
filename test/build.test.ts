import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const project = resolve(import.meta.dirname, '..');
const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'spindle-build-'));
  roots.push(root);
  mkdirSync(join(root, 'pack'));
  for (const path of ['.build', 'src', 'publish', 'pack/plugin.ts', 'pack/types.ts', 'pack/scripts',
    'vite.config.ts', 'postcss.config.js', 'package.json']) {
    cpSync(join(project, path), join(root, path), { recursive: true });
  }
  symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'), 'junction');
  const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
  writeFileSync(join(root, 'vite.config.ts'),
    `import { spindlePack } from './pack/plugin.js';\n` + config.replace('    spindlePlugin(),',
      `    spindlePlugin(),
    spindlePack({ name: 'Fixture', identifier: 'com.example.fixture', icon: '', version: '1.0.0', targets: ['joiplay'] }),`));
  writeFileSync(join(root, 'src/assets/app/index.ts'),
    'import "./styles/index.scss"; window.buildVersion = "old-app-build";');
  writeFileSync(join(root, 'src/assets/app/styles/index.scss'), 'body { --author-marker: 123; }');
  writeFileSync(join(root, 'src/story/Start.twee'), ':: StoryTitle\nFixture\n\n:: Start\nold-story-content');

  // Run the real plugins and compiler, recording external publishing commands
  // before they can reach the network. Native tooling is unnecessary for JoiPlay.
  writeFileSync(join(root, 'record-commands.mjs'), `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
const original = childProcess.execFileSync;
childProcess.execFileSync = function (command, args, options) {
  if (command !== 'butler' && command !== 'gh') return original(command, args, options);
  if (args[0] === 'push' || args[0] === 'workflow') {
    appendFileSync('uploads.jsonl', JSON.stringify({ command, args,
      html: readFileSync('dist/index.html', 'utf8'),
      media: readFileSync('dist/media/favicon.svg', 'utf8') }) + '\\n');
  }
  return '';
};
syncBuiltinESMExports();
`);
  // Pages checks still exercise a real clean, pushed Git branch, without any
  // remote operations. Build fixtures and generated output are all ignored.
  writeFileSync(join(root, '.gitignore'), '*\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'fixture');
  git('remote', 'add', 'origin', 'https://github.com/example/game.git');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('branch', '--set-upstream-to=origin/main');
  return root;
}

function run(root: string, args: string[]) {
  return execFileSync(process.execPath, ['--import', './record-commands.mjs', ...args], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', SPINDLE_PUBLISH: 'pages,itch',
      ITCH_USER: 'example', ITCH_GAME: 'game', SPINDLE_PACK_TARGETS: 'joiplay' },
    stdio: 'pipe',
    timeout: 60000,
  });
}

function build(root: string) {
  // Match development's preserved output directory, including a previous page
  // and package that must never be refreshed with a mix of old and new inputs.
  return run(root, ['node_modules/vite/bin/vite.js', 'build', '--emptyOutDir', 'false']);
}

function output(root: string) {
  return {
    html: readFileSync(join(root, 'dist/index.html'), 'utf8'),
    zip: readFileSync(join(root, 'dist/pack/joiplay/Fixture-joiplay.zip')),
    uploads: readFileSync(join(root, 'uploads.jsonl'), 'utf8'),
  };
}

function watch(root: string, actions: string) {
  writeFileSync(join(root, 'watch.mjs'), `
import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
const watcher = await build({ logLevel: 'silent', build: { watch: {}, emptyOutDir: false } });
function nextBuild(change = () => {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { watcher.off('event', onEvent); reject(new Error('Watch build timed out')); }, 30000);
    function onEvent(event) {
      if (event.code !== 'BUNDLE_END' && event.code !== 'ERROR') return;
      clearTimeout(timer);
      watcher.off('event', onEvent);
      resolve(event.code === 'BUNDLE_END' ? 'END' : 'ERROR');
    }
    watcher.on('event', onEvent);
    change();
  });
}
const results = [];
try {
  results.push(await nextBuild());
  ${actions}
  writeFileSync('watch-results.json', JSON.stringify(results));
} finally {
  await watcher.close();
}
`);
  run(root, ['watch.mjs']);
  return JSON.parse(readFileSync(join(root, 'watch-results.json'), 'utf8'));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test.each([
  ['unresolved import', 'src/assets/app/index.ts', 'import "./missing-module"; window.buildVersion = "new-app-build";'],
  ['SCSS error', 'src/assets/app/styles/index.scss', 'body { color: $undefined-color; }'],
  ['story error', 'src/story/StoryData.twee', ':: StoryData\n{"ifid":"D674C58C-DEFA-4F70-B7A2-27742230C0FC","start":"Missing","format":"spindle","format-version":"0.59.30"}'],
])('%s cannot compile, publish or package stale assets', (_name, path, invalid) => {
  const root = fixture();
  build(root);
  const before = output(root);
  const uploads = before.uploads.trim().split('\n').map((line) => JSON.parse(line));
  expect(uploads.map(({ command }) => command)).toEqual(['gh', 'butler']);
  for (const upload of uploads) {
    expect(upload.html.includes('old-app-build')).toBe(true);
    expect(upload.html.includes('old-story-content')).toBe(true);
    expect(upload.media).toContain('<svg');
  }
  writeFileSync(join(root, 'src/story/Start.twee'), ':: StoryTitle\nFixture\n\n:: Start\nnew-story-content');
  writeFileSync(join(root, path), invalid);
  expect(() => build(root)).toThrow();
  const after = output(root);
  expect(after.html === before.html).toBe(true);
  expect(after.zip.equals(before.zip)).toBe(true);
  expect(after.uploads === before.uploads).toBe(true);
}, 60000);

test('watch builds publish and package once per success, skip failures, and recover', () => {
  const root = fixture();
  const results = watch(root, `
  const page = readFileSync('dist/index.html', 'utf8');
  const zip = readFileSync('dist/pack/joiplay/Fixture-joiplay.zip');
  const uploads = readFileSync('uploads.jsonl', 'utf8');
  results.push(await nextBuild(() => {
    writeFileSync('src/story/Start.twee', ':: StoryTitle\\nFixture\\n\\n:: Start\\nnew-story-content');
    writeFileSync('src/assets/app/index.ts', 'import "./missing-module";');
  }));
  results.push({
    pageUnchanged: readFileSync('dist/index.html', 'utf8') === page,
    zipUnchanged: readFileSync('dist/pack/joiplay/Fixture-joiplay.zip').equals(zip),
    uploadsUnchanged: readFileSync('uploads.jsonl', 'utf8') === uploads,
  });
  results.push(await nextBuild(() => writeFileSync('src/assets/app/index.ts',
    'import "./styles/index.scss"; window.buildVersion = "new-app-build";')));
  results.push(!readFileSync('dist/pack/joiplay/Fixture-joiplay.zip').equals(zip));
  `);
  expect(results).toEqual(['END', 'ERROR', {
    pageUnchanged: true, zipUnchanged: true, uploadsUnchanged: true,
  }, 'END', true]);
  const after = output(root);
  expect(after.html.includes('new-app-build')).toBe(true);
  expect(after.html.includes('new-story-content')).toBe(true);
  expect(after.html.includes('old-app-build')).toBe(false);
  expect(after.uploads.trim().split('\n')).toHaveLength(4);
}, 60000);

test('watch builds replace stale CSS when rules are cleared or the last import is removed', () => {
  const root = fixture();
  const results = watch(root, `
  results.push(readFileSync('dist/styles/app.bundle.css', 'utf8').includes('--author-marker'));
  results.push(await nextBuild(() => writeFileSync('src/assets/app/styles/index.scss', '')));
  results.push(readFileSync('dist/styles/app.bundle.css', 'utf8'));
  results.push(readFileSync('dist/index.html', 'utf8').includes('--author-marker'));
  results.push(await nextBuild(() => writeFileSync('src/assets/app/styles/index.scss', 'body { --author-marker: 456; }')));
  results.push(readFileSync('dist/index.html', 'utf8').includes('--author-marker'));
  results.push(await nextBuild(() => writeFileSync('src/assets/app/index.ts', 'window.buildVersion = "no-css";')));
  results.push(readFileSync('dist/styles/app.bundle.css', 'utf8'));
  results.push(readFileSync('dist/index.html', 'utf8').includes('--author-marker'));
  `);
  expect(results).toEqual(['END', true, 'END', '', false, 'END', true, 'END', '', false]);
}, 60000);
