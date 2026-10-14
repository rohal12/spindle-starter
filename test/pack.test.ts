import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { spindlePack } from '../pack/plugin.js';
import { buildJoiPlay } from '../pack/scripts/build-joiplay.js';
import { artifactName } from '../pack/scripts/identifier.js';
import type { BuildContext } from '../pack/types.js';

const roots: string[] = [];
function context(name: string): BuildContext {
  const root = mkdtempSync(join(tmpdir(), 'spindle-pack-'));
  roots.push(root);
  const distDir = join(root, 'dist');
  const outDir = join(distDir, 'pack');
  mkdirSync(join(distDir, 'media'), { recursive: true });
  mkdirSync(outDir);
  writeFileSync(join(distDir, 'index.html'), '<html>A story</html>');
  writeFileSync(join(distDir, 'media/image.txt'), 'media');
  writeFileSync(join(outDir, 'old.apk'), 'exclude');
  return {
    projectRoot: root, distDir, outDir,
    config: { name, identifier: 'com.example.story', icon: '', version: '1.0.0',
      targets: ['joiplay'], window: { width: 960, height: 600 } },
  };
}

// Read the ZIP central directory to verify real archive entries, including
// that pack output is not recursively included. No external unzip tool needed.
function zipEntries(path: string): string[] {
  const zip = readFileSync(path);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  const names: string[] = [];
  let offset = zip.readUInt32LE(zip.length - 6);
  const count = zip.readUInt16LE(zip.length - 12);
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const size = zip.readUInt16LE(offset + 28);
    names.push(zip.subarray(offset + 46, offset + 46 + size).toString());
    offset += 46 + size + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return names;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test.each([
  ['Love/Hate', 'Love-Hate'], ['What? "Now"', 'What-Now'], ['../', 'story'],
  ['CON', '_CON'], ['con.txt', '_con.txt'], ['NuL.story.html', '_NuL.story.html'],
  ['COM1.saves', '_COM1.saves'], ['LPT9', '_LPT9'], ['COM¹.txt', '_COM¹.txt'],
  ['LPT²', '_LPT²'], ['COM³', '_COM³'], ['COM0', 'COM0'], ['CONquest', 'CONquest'],
  [' .Story. ', 'Story'], ['path\\name:*|<>\u0001', 'path-name'],
])('artifact name %s becomes %s', (name, expected) => {
  expect(artifactName(name)).toBe(expected);
});

test.each(['Love/Hate', 'CON.txt', 'COM¹.story'])('JoiPlay creates a real zip for %s', async (name) => {
  const ctx = context(name);
  await buildJoiPlay(ctx);
  const entries = zipEntries(join(ctx.outDir, 'joiplay', `${artifactName(name)}-joiplay.zip`));
  expect(entries).toContain('index.html');
  expect(entries).toContain('media/image.txt');
  expect(entries).toContain('README.txt');
  expect(entries.some((entry) => entry.startsWith('pack/'))).toBe(false);
  expect(ctx.config.name).toBe(name);
});

test('JoiPlay output errors reject instead of crashing the process', async () => {
  const ctx = context('Story');
  mkdirSync(join(ctx.outDir, 'joiplay/Story-joiplay.zip'), { recursive: true });
  await expect(buildJoiPlay(ctx)).rejects.toMatchObject({ code: 'EISDIR' });
});

test('the packaging plugin can load even when all targets are disabled', () => {
  expect(spindlePack({ ...context('Story').config, targets: [] }).name).toBe('vite-plugin-spindle-pack');
});
