import { expect, test } from 'vitest';
import { cargoResolved, npmPackageUrl, npmResolved, snapshot } from '../scripts/dependency-snapshot.mjs';

test('npm package URLs encode scopes and skip non-registry versions', () => {
  expect(npmPackageUrl('@rohal12/spindle', '0.61.7')).toBe('pkg:npm/%40rohal12/spindle@0.61.7');
  expect(npmPackageUrl('vite', '8.3.4')).toBe('pkg:npm/vite@8.3.4');
  expect(npmPackageUrl('local', 'file:../local')).toBeUndefined();
  expect(npmPackageUrl('linked', undefined)).toBeUndefined();
});

test('npm trees resolve nested copies, scopes and direct dependencies', () => {
  const resolved = npmResolved({
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: { tool: '^1.0.0' }, dependencies: { app: '^2.0.0' } },
      'node_modules/tool': { version: '1.2.0', dev: true, dependencies: { helper: '^1.0.0', shared: '^3.0.0' } },
      // tool needs helper 1, the top level has helper 2
      'node_modules/tool/node_modules/helper': { version: '1.0.1', dev: true, dependencies: { shared: '^3.0.0' } },
      'node_modules/helper': { version: '2.0.0' },
      'node_modules/shared': { version: '3.1.0', dev: true },
      'node_modules/app': { version: '2.0.0', dependencies: { helper: '^2.0.0' } },
      'node_modules/linked': { link: true, resolved: 'packages/linked' },
    },
  });
  expect(Object.keys(resolved).sort()).toEqual([
    'pkg:npm/app@2.0.0', 'pkg:npm/helper@1.0.1', 'pkg:npm/helper@2.0.0', 'pkg:npm/shared@3.1.0', 'pkg:npm/tool@1.2.0',
  ]);
  expect(resolved['pkg:npm/tool@1.2.0']).toEqual({
    package_url: 'pkg:npm/tool@1.2.0',
    relationship: 'direct',
    scope: 'development',
    dependencies: ['pkg:npm/helper@1.0.1', 'pkg:npm/shared@3.1.0'],
  });
  // Found in the enclosing node_modules
  expect(resolved['pkg:npm/helper@1.0.1'].dependencies).toEqual(['pkg:npm/shared@3.1.0']);
  expect(resolved['pkg:npm/helper@1.0.1'].relationship).toBe('indirect');
  expect(resolved['pkg:npm/app@2.0.0']).toMatchObject({ relationship: 'direct', scope: 'runtime' });
  expect(resolved['pkg:npm/helper@2.0.0']).toMatchObject({ relationship: 'indirect', scope: 'runtime' });
});

test('a version installed in several places is runtime if any copy is', () => {
  const resolved = npmResolved({
    packages: {
      '': { dependencies: { a: '*' }, devDependencies: { b: '*' } },
      'node_modules/a': { version: '1.0.0', dependencies: { c: '*' } },
      'node_modules/a/node_modules/c': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0', dev: true, dependencies: { c: '*' } },
      'node_modules/b/node_modules/c': { version: '1.0.0', dev: true },
    },
  });
  expect(resolved['pkg:npm/c@1.0.0'].scope).toBe('runtime');
});

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
  const resolved = { 'pkg:npm/vite@8.3.4': { package_url: 'pkg:npm/vite@8.3.4', relationship: 'direct', scope: 'development', dependencies: [] } };
  const result = snapshot({ 'package.json': resolved }, env, new Date('2026-10-27T12:00:00Z'));
  expect(result).toMatchObject({
    version: 0,
    sha: 'head',
    ref: 'refs/pull/7/merge',
    job: { correlator: 'Dependencies snapshot', id: '42' },
    scanned: '2026-10-27T12:00:00.000Z',
    manifests: { 'package.json': { name: 'package.json', file: { source_location: 'package.json' }, resolved } },
  });
  expect(snapshot({}, { ...env, SNAPSHOT_SHA: '' }, new Date()).sha).toBe('merge');
  expect(() => snapshot({}, { ...env, GITHUB_RUN_ID: undefined }, new Date())).toThrow('GITHUB_RUN_ID is not set');
});
