# Changelog

## Unreleased

- Harden the GitHub workflows: pin actions to commit SHAs, grant each job only the permissions it needs, pass release tags and itch.io settings to scripts through environment variables, skip dependency caches in release and deploy builds, and stop persisting checkout credentials.
- Add Dependabot configuration for npm, Cargo, Gradle, the dev container and GitHub Actions, with weekly grouped updates and a one-week cooldown for new releases.
- `npm run setup` also removes the starter's CI, CodeQL, Scorecard and workflow-lint workflows and its security policy.
- Give bundled images and other non-font assets content hashes so replacements refresh the development player; CSS image updates preserve story state.
- Honor Cargo build targets from environment and configuration when building, cleaning bundles and collecting desktop artifacts.
- Materialize linked media files and directories so web output and archives remain usable without the source checkout.
- Give emitted fonts content hashes so replacing a font refreshes the development player without resetting story state.
- Collect desktop artifacts and clean bundles in Cargo's configured target directory, and select the exact Windows main executable instead of an arbitrary older binary.
- Preserve player state when CSS is added after loading with an empty author stylesheet.
- Rebuild watched production output and opted-in packages when story, head content or media inputs change.
- Print the actual development server URL when the preferred port is occupied.
- Prevent failed asset or story builds from publishing or packaging stale output.
- Clear deleted author styles in the development player when the stylesheet becomes empty or its last import is removed.
- Generate distinct, stable IFIDs for degit copies nested inside another Git repository.
- Skip native packaging for local web publishing and honor explicit itch channel overrides over configured defaults.
- Use safe Tauri product names while preserving the story window title, and pass Windows packaging paths containing percent sequences without shell expansion.
- Export desktop saves through a native file picker with completion, cancellation and failure feedback; open external new-window links in the system browser.
- Restore media watching when the source directory is created, removed or replaced during development.
- Preserve project documentation, workflows and package settings on every install, including projects without Git. Move template cleanup to the explicit, optional `npm run setup` command.
- Use archiver 8's named `ZipArchive` API so opt-in packaging and web builds with packaging disabled load successfully.
- Require both Android release-signing secrets, reject incomplete signing settings before native build work, and prevent release builds from falling back to debug signing.
- Deploy Pages from the tracked remote branch even when the local branch has a different name.
- Sanitize Windows device names with extensions and superscript COM/LPT numbers in artifact filenames without changing story display titles.
- Add build-tool regression tests (`npm test`).

## 2.3.0

- Update dependencies: `@rohal12/spindle` 0.51 → 0.59.30 (also fixes the QuickSave button), `@rohal12/spindle-lsp` 0.9 → 0.13, Vite 7 → 8, TypeScript 5 → 7, archiver 7 → 8, Capacitor 7 → 8 (Android project migrated: Gradle 8.14, AGP 8.13, compile/target SDK 36), sass, postcss-preset-env, tsx. `@rohal12/twee-ts` is 1.18.2. StoryData's `format-version` is now `0.59.30`
- Fix fonts and images referenced from SCSS using absolute `/...` URLs, which broke on GitHub Pages project sites and JoiPlay
- Fix your stylesheet loading before Spindle's own styles, so rules like `body { font-family: ... }` were overridden; it's now added as a story stylesheet, ahead of any `[stylesheet]` passages (so those still override it). `@import` belongs in your SCSS: in a stylesheet passage it is no longer at the top and is ignored
- Add [spindle-starter-demo](https://github.com/rohal12/spindle-starter-demo): a demo story built from the template on every push to `main` and every release, with a web version and downloadable builds
- The template repo's own build workflows skip themselves; the demo repo builds the binaries
- Fix `npm install` failing on Windows without Bash: the postinstall script is now Node. It also no longer deletes `docs/` and `CHANGELOG.md` in a Git worktree or submodule, and gives a degit project its own IFID. Run `npm run ifid` to replace the template's IFID in a clone or template repo (stories sharing an IFID share saves)
- Fix `npm run publish:pages` / `publish:itch` on Windows; `publish:itch -- --channel <name>` now works as documented
- Fix `npm run build` succeeding on compiler errors such as a missing start passage; it now fails and `npm run dev` keeps the last good build and prints the errors
- Fix the app bundle: dynamic `import()` works, source maps are embedded, and `onStoryStartup()` (in `src/assets/app/startup.ts`) runs code once `window.Story` exists
- Dev server: CSS changes apply without a page reload, and `src/assets/media` changes are copied immediately
- TypeScript: ESNext libs and imports from `src/assets/vendor` type-check
- `deploy-docs.yml` only runs in the starter repository, so projects made from the template no longer have their Pages site replaced
- `publish:pages` dispatches to the repository the branch tracks (`--repo`), not `gh`'s default
- Pack: the Android app can export saves: Export opens the system file picker (before, the button reported success but wrote nothing)
- Pack: Android launcher icons come from the configured `icon`; signed Android builds pass keystore passwords to Gradle via the environment instead of the command line (they leaked into logs and `ps`); release workflow requires a keystore; names with `/`, `$` etc. no longer break artifact paths or shell commands; a half-installed Capacitor is repaired

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
