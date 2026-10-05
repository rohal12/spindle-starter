# Changelog

## 2.2.0

- Add `spindlePack` Vite plugin (opt-in) for desktop (Tauri), Android (Capacitor) and JoiPlay builds, with GitHub Actions workflows
- Replace `scripts/publish.sh` with the `spindlePublish` Vite plugin
- Update dependencies: `@rohal12/spindle` 0.3.1 → 0.51.0, `@rohal12/twee-ts` 1.1.2 → 1.17.0
- Add `@rohal12/spindle-lsp` 0.9.2 and an `npm run lint` script for story files; the deploy workflows run it before building
- Fix `npm run dev` building with `NODE_ENV=production` after the first rebuild (test mode off, no sourcemaps)
- Fix publish and pack plugins running before `dist/index.html` was written
- Copy `src/assets/media/` to `dist/media/` so the documented `media/...` URLs work
- `publish:pages` refuses to run with uncommitted or unpushed changes and deploys the current branch
- Fix desktop and Android packaging failing with `ERR_MODULE_NOT_FOUND`
- Pack: start from a clean copy of `dist/` without earlier pack output, stop rewriting tracked config files, apply the app id/name/version to the Android build, fall back to the favicon when no icon is configured, validate `SPINDLE_PACK_TARGETS` and accept `none`
- CI: fix Windows release upload, keystore decoding and release permissions; install Capacitor deps without a lockfile
- Remove the unused SugarCube `index.html`

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
