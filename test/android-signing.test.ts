import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { androidSigning } from '../pack/scripts/android-signing.js';
import { buildCapacitor } from '../pack/scripts/build-capacitor.js';
import { vi } from 'vitest';
import type { BuildContext } from '../pack/types.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('no signing configuration allows a development debug build', () => {
  expect(androidSigning({})).toBeNull();
});
test.each([
  { SPINDLE_ANDROID_RELEASE: '1' },
  { SPINDLE_KEYSTORE_PATH: '/missing.keystore' },
  { SPINDLE_KEYSTORE_PASSWORD: 'secret' },
  { SPINDLE_KEY_ALIAS: 'release' },
  { SPINDLE_KEY_PASSWORD: 'secret' },
  { SPINDLE_ANDROID_RELEASE: '1', SPINDLE_KEYSTORE_PATH: '/missing.keystore' },
])('missing or partial signing configuration rejects: %j', (env) => {
  expect(() => androidSigning(env)).toThrow('requires both');
});
test('a missing keystore cannot produce a signed release', () => {
  expect(() => androidSigning({ SPINDLE_KEYSTORE_PATH: '/missing.keystore',
    SPINDLE_KEYSTORE_PASSWORD: 'secret' })).toThrow('existing keystore file');
});
test('complete signing defaults the alias and key password without logging credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'spindle-signing-'));
  roots.push(root);
  const path = join(root, 'release.keystore');
  writeFileSync(path, 'fixture');
  const env = { SPINDLE_KEYSTORE_PATH: path, SPINDLE_KEYSTORE_PASSWORD: 'store-secret',
    SPINDLE_ANDROID_RELEASE: '1' };
  expect(androidSigning(env)).toEqual({ path, password: 'store-secret', alias: 'release',
    keyPassword: 'store-secret' });
  expect(androidSigning({ ...env, SPINDLE_KEY_ALIAS: 'game', SPINDLE_KEY_PASSWORD: 'key-secret' }))
    .toEqual({ path, password: 'store-secret', alias: 'game', keyPassword: 'key-secret' });
  expect(() => androidSigning({ ...env, SPINDLE_KEYSTORE_PATH: root })).toThrow('existing keystore file');
});
test('the Android builder rejects an unsigned release before checking native prerequisites', async () => {
  for (const key of ['SPINDLE_KEYSTORE_PATH', 'SPINDLE_KEYSTORE_PASSWORD', 'SPINDLE_KEY_ALIAS',
    'SPINDLE_KEY_PASSWORD', 'ANDROID_HOME', 'ANDROID_SDK_ROOT']) vi.stubEnv(key, undefined);
  vi.stubEnv('SPINDLE_ANDROID_RELEASE', '1');
  await expect(buildCapacitor({} as BuildContext)).rejects.toThrow('requires both');
});
