# Publishing

When your story is ready to share, Spindle Starter supports two deployment targets out of the box: **GitHub Pages** and **itch.io**. Both are available as one-line CLI commands and as GitHub Actions workflows.

## Production Build

Before publishing, you can test the production build locally:

```sh
npm run build
npm run preview
```

`npm run build` compiles everything into `dist/` with optimizations enabled (CSS minification, no sourcemaps, test mode disabled). `npm run preview` serves that folder locally so you can check it before deploying.

## GitHub Pages

### Quick Start

If your project is already on GitHub:

```sh
npm run publish:pages
```

This triggers the GitHub Actions workflow which builds and deploys your story. It requires the [GitHub CLI](https://cli.github.com/) (`gh`) to be installed and authenticated.

### Setup

1. Push your project to a GitHub repository
2. Go to **Settings > Pages**
3. Set the source to **GitHub Actions**

That's it. The workflow at `.github/workflows/deploy-pages.yml` handles the rest. Your story will be available at `https://<username>.github.io/<repo-name>/`.

### How It Works

The workflow (`.github/workflows/deploy-pages.yml`):

1. Checks out your code
2. Installs dependencies with `npm ci`
3. Runs `npm run build` with `NODE_ENV=production`
4. Uploads `dist/` to GitHub Pages

It's triggered manually — either from the **Actions** tab in your repo or via `npm run publish:pages`.

## itch.io

[itch.io](https://itch.io/) is a popular platform for publishing interactive fiction and games.

### Quick Start

With [butler](https://itch.io/docs/butler/) installed locally:

```sh
npm run publish:itch -- --user your-username --game your-game
```

Or set environment variables to avoid typing them each time:

```sh
export ITCH_USER=your-username
export ITCH_GAME=your-game
npm run publish:itch
```

### Setup for GitHub Actions

To deploy automatically from GitHub:

1. Create your project on [itch.io](https://itch.io/game/new) (set **Kind of project** to "HTML")
2. Get your [API key](https://itch.io/user/settings/api-keys)
3. In your GitHub repo, go to **Settings > Secrets and variables > Actions**:
   - Add a **secret** named `BUTLER_API_KEY` with your API key
   - Add **variables** `ITCH_USER` (your itch.io username) and `ITCH_GAME` (your project's URL slug)

Then trigger the workflow from the **Actions** tab or with:

```sh
npm run publish:itch
```

### Options

The default butler channel is `html5`. Override it with:

```sh
npm run publish:itch -- --channel web
```

### Creating Your itch.io Project

If you haven't published to itch.io before:

1. Go to [itch.io/game/new](https://itch.io/game/new)
2. Set **Kind of project** to **HTML**
3. Fill in the title and other details
4. Under **Uploads**, you don't need to upload anything manually — butler handles it
5. Check **This file will be played in the browser**
6. Save and publish

## Test Mode

In development (`npm start`), test mode is enabled automatically — this adds debugging tools from the Spindle format. Production builds (`npm run build`) disable test mode. You don't need to configure anything.
