import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterEach, expect, test } from 'vitest';
import { syncMedia } from '../.build/media.js';
import { buildJoiPlay } from '../pack/scripts/build-joiplay.js';
import type { BuildContext } from '../pack/types.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Inspect the real ZIP's file type and decompress its payload without depending
// on a system unzip executable or following any filesystem links.
function archivedFile(path: string, name: string): { mode: number; bytes: Buffer } {
  const zip = readFileSync(path);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  let offset = zip.readUInt32LE(zip.length - 6);
  const count = zip.readUInt16LE(zip.length - 12);
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (entryName === name) {
      const localOffset = zip.readUInt32LE(offset + 42);
      expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
      const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const compressed = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
      const method = zip.readUInt16LE(offset + 10);
      expect([0, 8]).toContain(method);
      return {
        mode: zip.readUInt32LE(offset + 38) >>> 16,
        bytes: method === 8 ? inflateRawSync(compressed) : compressed,
      };
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing ZIP entry: ${name}`);
}

// Preserving a symlink instead of copying its target must fail these cases:
// dist and its archive must retain the media after the original is removed.
test.each([
  ['file', 'relative', 'asset.bin'],
  ['file', 'absolute', 'asset.bin'],
  ['directory', 'relative', 'images/asset.bin'],
  ['directory', 'absolute', 'images/asset.bin'],
  ['root', 'relative', 'asset.bin'],
  ['root', 'absolute', 'asset.bin'],
] as const)('packages a %s symlink with a %s target as independent media', async (kind, targetKind, entryName) => {
  const root = mkdtempSync(join(tmpdir(), 'spindle-media-archive-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  const media = join(projectRoot, 'src/assets/media');
  const original = join(root, 'original');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0a, 0x80]);
  mkdirSync(original);
  writeFileSync(join(original, 'asset.bin'), bytes);
  const link = kind === 'root' ? media : join(media, kind === 'file' ? 'asset.bin' : 'images');
  const target = kind === 'file' ? join(original, 'asset.bin') : original;
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(targetKind === 'relative' ? relative(dirname(link), target) : target, link, kind === 'file' ? 'file' : 'dir');

  syncMedia(projectRoot);
  const distDir = join(projectRoot, 'dist');
  const copied = join(distDir, 'media', entryName);
  expect(lstatSync(copied).isFile()).toBe(true);
  expect(lstatSync(dirname(copied)).isDirectory()).toBe(true);
  rmSync(original, { recursive: true });
  expect(readFileSync(copied)).toEqual(bytes);

  const ctx: BuildContext = {
    projectRoot, distDir, outDir: join(distDir, 'pack'),
    config: {
      name: 'Story', identifier: 'com.example.story', icon: '', version: '1.0.0',
      targets: ['joiplay'], window: { width: 960, height: 600 },
    },
  };
  writeFileSync(join(distDir, 'index.html'), '<html>A story</html>');
  await buildJoiPlay(ctx);
  rmSync(join(distDir, 'media'), { recursive: true });
  const archived = archivedFile(join(ctx.outDir, 'joiplay/Story-joiplay.zip'), `media/${entryName}`);
  expect(archived.mode & 0o170000).toBe(0o100000);
  expect(archived.bytes).toEqual(bytes);
});
