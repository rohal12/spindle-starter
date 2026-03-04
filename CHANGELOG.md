# Changelog

## 2.1.0

- Update dependencies: `@rohal12/spindle` 0.3.0 → 0.3.1, `@rohal12/twee-ts` 1.1.1 → 1.1.2
- Update dependencies: `vite` 6.4.1 → 7.3.1, `postcss-preset-env` 10.6.1 → 11.2.0, `postcss` 8.5.6 → 8.5.8, `sass` 1.97.2 → 1.97.3
- Fix audit vulnerabilities (rollup, minimatch, lodash)
- Remove unused dependencies: `cross-env`, `cross-spawn`, `decompress`, `del`, `got`
- Replace SugarCube PNG favicon with Spindle SVG favicon
- Add devcontainer configuration

## 2.0.0

- Convert from sugarcube-starter to spindle-starter
- Replace SugarCube + Tweego binary compiler with Spindle + twee-ts npm packages
- Replace tweego Vite plugin with twee-ts `compileToFile` API
- Remove error overlay (console errors suffice)
- Update metadata, author, and license (Unlicense)
