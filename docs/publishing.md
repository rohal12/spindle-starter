# Publishing

When your story is ready to share, Spindle Starter supports two deployment targets out of the box: **GitHub Pages** and **itch.io**. Both are available as one-line CLI commands and as GitHub Actions workflows.

## Production Build

Before publishing, you can test the production build locally:

```sh
npm run build
npm run preview
```

`npm run build` compiles everything into `dist/` with optimizations enabled (CSS minification, no sourcemaps, test mode disabled). `npm run preview` serves that folder locally so you can check it before deploying.

Publishing and packaging run only after both asset bundling and story compilation succeed. A failed build does not upload or package files left over from an earlier build.

## GitHub Pages

### Quick Start

If your project is already on GitHub:

```sh
npm run publish:pages
```

This builds the story locally as a check, then triggers the GitHub Actions workflow in the repository and remote branch your local branch tracks. For example, local `story` tracking `origin/main` deploys `main`. Because the deployed version comes from GitHub, the command refuses to run with uncommitted or unpushed changes. It requires the [GitHub CLI](https://cli.github.com/) (`gh`) to be installed and authenticated.

### Setup

1. Push your project to a GitHub repository
2. Go to **Settings > Pages**
3. Set the source to **GitHub Actions**

That's it. The workflow at `.github/workflows/deploy-pages.yml` handles the rest. Your story will be available at `https://<username>.github.io/<repo-name>/`.

### How It Works

The workflow (`.github/workflows/deploy-pages.yml`):

1. Checks out your code
2. Installs dependencies with `npm install`
3. Lints the story with `npm run lint`
4. Runs `npm run build` with `NODE_ENV=production`
5. Uploads `dist/` to GitHub Pages

It's triggered manually — either from the **Actions** tab in your repo or via `npm run publish:pages`.

## Android releases

The Android workflow (`.github/workflows/build-android.yml`) builds an APK with `spindlePack`'s `android` target. Run manually it uploads the APK as a workflow artifact; when you publish a GitHub release it also attaches the APK to that release.

### Exporting saves on Android

The save manager's **Export** button works in the Android app: it opens the system file picker so the player chooses where the save file goes, and shows "Saved" once the file is written (or "Export cancelled"). Spindle's own "Save exported" message appears immediately, whatever the player chooses in the picker. Importing uses the same picker.

### Signing Android releases

Android only installs an update over an existing game if both APKs are signed with the same key. Fresh runners generate different debug keys, so players would have to uninstall the game, deleting their saves, to update. The workflow therefore **requires both the keystore and its password for releases**. Manual runs without signing settings produce debug APKs for testing; incomplete signing settings fail instead of silently producing a debug APK.

Create a keystore once and keep it safe (if you lose it you can never update installed games):

```sh
keytool -genkeypair -keystore release.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000
```

Use the same password for the keystore and the key (keytool's default for PKCS12 keystores). Then add these **secrets** under **Settings > Secrets and variables > Actions**:

| Secret              | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `KEYSTORE_BASE64`   | The keystore file, base64 encoded (`base64 -w0 release.keystore`) |
| `KEYSTORE_PASSWORD` | The keystore password                                            |
| `KEY_ALIAS`         | Optional, defaults to `release`                                  |
| `KEY_PASSWORD`      | Optional, defaults to the keystore password                      |

For a local build, set `SPINDLE_KEYSTORE_PATH`, `SPINDLE_KEYSTORE_PASSWORD`, and optionally `SPINDLE_KEY_ALIAS` and `SPINDLE_KEY_PASSWORD`. Set `SPINDLE_ANDROID_RELEASE=1` to require a signed release; the release workflow sets this automatically. The builder checks for complete signing settings and an existing keystore file before starting native build work. Invalid keys or passwords fail the Gradle build. The passwords are handed to Gradle through the environment, not the command line.

Packaging derives safe artifact filenames from the story's display name. For example, `Love/Hate` produces `Love-Hate.apk` and `Love-Hate-joiplay.zip`; Windows device names such as `CON.txt` are prefixed with `_`. Desktop builds use the same safe name for Tauri's product name and keep the original title in the story window. Paths containing spaces, `$` or literal `%NAME%` sequences are passed unchanged to packaging tools, including on Windows.

Desktop packaging uses Cargo metadata to locate build artifacts, including when `CARGO_TARGET_DIR` or Cargo's `build.target-dir` setting overrides the output directory. The finished packages are still collected into `dist/pack/<platform>/`.

In desktop apps, exporting a save opens a native file picker. A dialog reports the saved path, cancellation or failure after the picker closes. External `http`, `https` and `mailto` links requesting a new window (including `window.open()`) open in the system browser or mail client while the story remains open.

## itch.io

[itch.io](https://itch.io/) is a popular platform for publishing interactive fiction and games.

### Quick Start

With [butler](https://itch.io/docs/butler/) installed locally:

```sh
ITCH_USER=your-username ITCH_GAME=your-game npm run publish:itch
```

Or set the environment variables once per shell session:

```sh
export ITCH_USER=your-username
export ITCH_GAME=your-game
npm run publish:itch
```

On Windows, use `set ITCH_USER=your-username` and `set ITCH_GAME=your-game` in Command Prompt, or `$env:ITCH_USER = "your-username"` and `$env:ITCH_GAME = "your-game"` in PowerShell.

`npm run publish:itch` builds the story on your machine and uploads it with your local butler. It does not use the GitHub repository variables and secrets described below. Both local web publishing commands (`publish:itch` and `publish:pages`) skip packaging, even when native targets are enabled in your configuration or environment.

You can also set them permanently in `vite.config.ts` with `spindlePublish({ itch: { user: 'your-username', game: 'your-game' } })`. The default channel is `html5`; override it with `ITCH_CHANNEL`.

### Setup for GitHub Actions

To deploy automatically from GitHub:

1. Create your project on [itch.io](https://itch.io/game/new) (set **Kind of project** to "HTML")
2. Get your [API key](https://itch.io/user/settings/api-keys)
3. In your GitHub repo, go to **Settings > Secrets and variables > Actions**:
   - Add a **secret** named `BUTLER_API_KEY` with your API key
   - Add **variables** `ITCH_USER` (your itch.io username) and `ITCH_GAME` (your project's URL slug)

Then trigger the workflow from the **Actions** tab or with the [GitHub CLI](https://cli.github.com/):

```sh
gh workflow run deploy-itch.yml
```

### Options

The default butler channel is `html5`. Override it for a local publish with `--channel`:

```sh
npm run publish:itch -- --channel web
```

`--channel` overrides `ITCH_CHANNEL` and the configured `itch.channel` default. Without the flag, `ITCH_CHANNEL` overrides the configured channel; without either, the configured channel or `html5` is used. The GitHub Actions workflow takes a `channel` input instead: `gh workflow run deploy-itch.yml -f channel=web`.

### Creating Your itch.io Project

If you haven't published to itch.io before, follow this guide to set up your project for a browser-based story game. These settings only need to be configured once — after that, butler pushes will update the game files automatically.

#### 1. Create the Project

Go to [itch.io/game/new](https://itch.io/game/new) and fill in:

| Field               | Recommended value                                    |
| ------------------- | ---------------------------------------------------- |
| **Title**           | Your game's name                                     |
| **Kind of project** | **HTML** (required — this enables browser embedding) |
| **Classification**  | Interactive fiction, or RPG if applicable            |
| **Release status**  | In development (you can change this later)           |

#### 2. Upload via Butler

You don't need to upload anything through the web form. Run your first butler push instead:

```sh
ITCH_USER=your-username ITCH_GAME=your-game npm run publish:itch
```

Or trigger the GitHub Actions workflow after setting up `BUTLER_API_KEY`, `ITCH_USER`, and `ITCH_GAME` (see [Setup for GitHub Actions](#setup-for-github-actions) above).

After the first push, refresh your project's edit page — you'll see the upload listed under **Uploads**.

#### 3. Configure Embed Settings

Once your upload appears, configure how the game is displayed:

1. Under **Uploads**, check **This file will be played in the browser** on your html5 upload
2. An **Embed options** section will appear below. Set:
   - **Embed in page** — this is best for story games so players can start immediately
   - **Viewport dimensions** — `960 × 600` works well for most Spindle stories. Adjust based on your UI layout
   - **Enable fullscreen button** — check this so players can expand the game to fill their screen (recommended for RPG interfaces with HUD elements)
   - **Enable scrollbars** — leave unchecked unless your story content overflows the viewport
   - **Mobile friendly** — check this if your CSS handles responsive layouts (Spindle's default styles do)

#### 4. Recommended Page Settings

These settings on the same edit page improve the experience for interactive fiction:

| Setting         | Recommendation                                                             |
| --------------- | -------------------------------------------------------------------------- |
| **Cover image** | Upload a 630×500 image — this is what players see in search results        |
| **Description** | Write a short pitch. Mention it's browser-playable with no download needed |
| **Tags**        | `interactive-fiction`, `twine`, `rpg`, `text-based`, `browser`             |
| **Genre**       | Role Playing                                                               |
| **Community**   | Enable comments — player feedback is valuable                              |
| **Visibility**  | Set to **Public** when you're ready for players to find it                 |

#### 5. Save and Verify

Click **Save** at the bottom, then visit your project page to confirm:

- The game loads in the embedded player
- The fullscreen button appears and works
- Text is readable and the UI fits the viewport

Future butler pushes will update the game files without needing to reconfigure any of these settings.

## Test Mode

In development (`npm start`), test mode is enabled automatically — this adds debugging tools from the Spindle format. Production builds (`npm run build`) disable test mode. You don't need to configure anything.
