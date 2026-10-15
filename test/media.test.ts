import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { syncMedia, watchMedia } from '../.build/media.js';

const fixtures: { root: string; stop: () => void }[] = [];
afterEach(() => {
  for (const { root, stop } of fixtures.splice(0)) {
    stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test.each([true, false])('media watching survives replacement (exists at startup: %s)', async (initial) => {
  const root = mkdtempSync(join(tmpdir(), 'spindle-media-'));
  const media = join(root, 'src/assets/media');
  const dist = join(root, 'dist/media');
  mkdirSync(join(root, 'src/assets'), { recursive: true });
  if (initial) {
    mkdirSync(media);
    writeFileSync(join(media, 'old.svg'), 'old');
  }
  syncMedia(root);
  const reload = vi.fn();
  fixtures.push({ root, stop: watchMedia(root, reload) });
  if (initial) renameSync(media, join(root, 'src/assets/previous-media'));
  mkdirSync(media);
  writeFileSync(join(media, 'new.svg'), 'new');
  await vi.waitFor(() => {
    expect(existsSync(join(dist, 'new.svg'))).toBe(true);
    expect(existsSync(join(dist, 'old.svg'))).toBe(false);
  }, { timeout: 4000 });
  writeFileSync(join(media, 'later.svg'), 'later');
  await vi.waitFor(() => expect(readFileSync(join(dist, 'later.svg'), 'utf8')).toBe('later'), { timeout: 4000 });
  writeFileSync(join(media, 'later.svg'), 'updated');
  await vi.waitFor(() => expect(readFileSync(join(dist, 'later.svg'), 'utf8')).toBe('updated'), { timeout: 4000 });
  rmSync(media, { recursive: true });
  await vi.waitFor(() => expect(existsSync(dist)).toBe(false), { timeout: 4000 });
  expect(reload).toHaveBeenCalled();
});
