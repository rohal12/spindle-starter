import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { statSync, watch, type FSWatcher } from 'fs';
import { afterEach, expect, test, vi } from 'vitest';
import { watchMedia } from '../.build/media.js';

vi.mock('fs', () => ({
  cpSync: vi.fn(), existsSync: vi.fn().mockReturnValue(false), mkdirSync: vi.fn(),
  rmSync: vi.fn(), statSync: vi.fn(), watch: vi.fn(),
}));
const real = await vi.importActual<typeof import('fs')>('fs');

function watcher() {
  return Object.assign(new EventEmitter(), { close: vi.fn() });
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test.each(['EPERM', 'ENOENT'])('media watching recovers from a Windows deletion error: %s', (code) => {
  vi.useFakeTimers();
  const parent = watcher();
  const original = watcher();
  const replacement = watcher();
  vi.mocked(watch)
    .mockReturnValueOnce(parent as unknown as FSWatcher)
    .mockReturnValueOnce(original as unknown as FSWatcher)
    .mockReturnValueOnce(replacement as unknown as FSWatcher);
  vi.mocked(statSync).mockReturnValue(real.statSync(tmpdir()));
  const reload = vi.fn();
  const stop = watchMedia('/story', reload);
  try {
    // Windows can deliver this before the parent reports the replacement.
    expect(() => original.emit('error', Object.assign(new Error('removed'), { code }))).not.toThrow();
    vi.advanceTimersByTime(101);
    expect(original.close).toHaveBeenCalled();
    expect(watch).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledOnce();
  } finally { stop(); }
});
