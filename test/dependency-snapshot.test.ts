import { expect, test } from 'vitest';
import { cargoResolved, snapshot } from '../scripts/dependency-snapshot.mjs';

test('cargo trees separate runtime crates from build-only ones', () => {
  const registry = 'registry+https://github.com/rust-lang/crates.io-index';
  const resolved = cargoResolved({
    packages: [
      { id: 'story', name: 'spindle-story', version: '0.1.0', source: null },
      { id: 'tauri', name: 'tauri', version: '2.12.0', source: registry },
      { id: 'serde', name: 'serde', version: '1.0.228', source: registry },
      { id: 'build', name: 'tauri-build', version: '2.5.0', source: registry },
      { id: 'toml', name: 'toml', version: '0.9.8', source: 'sparse+https://index.crates.io/' },
      { id: 'git', name: 'from-git', version: '0.1.0', source: 'git+https://example.com/x' },
    ],
    resolve: {
      root: 'story',
      nodes: [
        { id: 'story', deps: [
          { pkg: 'tauri', dep_kinds: [{ kind: null }] },
          { pkg: 'build', dep_kinds: [{ kind: 'build' }] },
        ] },
        { id: 'tauri', deps: [{ pkg: 'serde', dep_kinds: [{ kind: null }] }, { pkg: 'git', dep_kinds: [{ kind: null }] }] },
        { id: 'build', deps: [{ pkg: 'toml', dep_kinds: [{ kind: null }] }] },
        { id: 'serde', deps: [] },
        { id: 'toml', deps: [] },
        { id: 'git', deps: [] },
      ],
    },
  });
  expect(Object.keys(resolved).sort()).toEqual([
    'pkg:cargo/serde@1.0.228', 'pkg:cargo/tauri-build@2.5.0', 'pkg:cargo/tauri@2.12.0', 'pkg:cargo/toml@0.9.8',
  ]);
  expect(resolved['pkg:cargo/tauri@2.12.0']).toEqual({
    package_url: 'pkg:cargo/tauri@2.12.0',
    relationship: 'direct',
    scope: 'runtime',
    dependencies: ['pkg:cargo/serde@1.0.228'],
  });
  expect(resolved['pkg:cargo/serde@1.0.228']).toMatchObject({ relationship: 'indirect', scope: 'runtime' });
  expect(resolved['pkg:cargo/tauri-build@2.5.0']).toMatchObject({ relationship: 'direct', scope: 'development' });
  expect(resolved['pkg:cargo/toml@0.9.8']).toMatchObject({ relationship: 'indirect', scope: 'development' });
});

test('snapshots describe the commit and run, and need the workflow variables', () => {
  const env = {
    GITHUB_SHA: 'merge', GITHUB_REF: 'refs/pull/7/merge', GITHUB_WORKFLOW: 'Dependencies', GITHUB_JOB: 'snapshot',
    GITHUB_RUN_ID: '42', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'rohal12/spindle-starter',
    SNAPSHOT_SHA: 'head',
  };
  const resolved = { 'pkg:cargo/tauri@2.12.0': { package_url: 'pkg:cargo/tauri@2.12.0', relationship: 'direct', scope: 'runtime', dependencies: [] } };
  const manifest = 'pack/tauri/src-tauri/Cargo.toml';
  const result = snapshot({ [manifest]: resolved }, env, new Date('2026-10-27T12:00:00Z'));
  expect(result).toMatchObject({
    version: 0,
    sha: 'head',
    ref: 'refs/pull/7/merge',
    job: { correlator: 'Dependencies snapshot', id: '42' },
    scanned: '2026-10-27T12:00:00.000Z',
    manifests: { [manifest]: { name: manifest, file: { source_location: manifest }, resolved } },
  });
  expect(snapshot({}, { ...env, SNAPSHOT_SHA: '' }, new Date()).sha).toBe('merge');
  expect(() => snapshot({}, { ...env, GITHUB_RUN_ID: undefined }, new Date())).toThrow('GITHUB_RUN_ID is not set');
});
