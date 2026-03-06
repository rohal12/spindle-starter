# Project Structure

Here's what each file and folder in a Spindle Starter project does.

## Overview

```
my-story/
├── .build/
│   └── dev.ts               # Development server script
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml  # GitHub Pages deployment
│       └── deploy-itch.yml   # itch.io deployment
├── src/
│   ├── assets/
│   │   ├── app/
│   │   │   ├── index.ts      # JavaScript/TypeScript entry point
│   │   │   ├── globals.d.ts  # TypeScript type declarations
│   │   │   └── styles/
│   │   │       └── index.scss  # Main stylesheet
│   │   ├── fonts/            # Custom web fonts
│   │   ├── media/            # Images, favicon, etc.
│   │   └── vendor/           # Third-party scripts
│   ├── story/                # Your Twee story files
│   │   ├── StoryData.twee    # Story metadata
│   │   └── Start.twee        # Starting passage
│   └── head-content.html     # Extra HTML for <head>
├── package.json
├── postcss.config.js         # CSS processing config
├── tsconfig.json             # TypeScript config
└── vite.config.ts            # Build config
```

## Source Files (`src/`)

This is where all your work goes.

### `src/story/`

Your Twee story files live here. You can organize them however you like — create subfolders for chapters, locations, characters, or whatever makes sense for your project. The compiler recursively finds all `.twee` and `.tw` files.

```
src/story/
├── StoryData.twee        # Required — story metadata
├── Start.twee            # Your starting passage
├── chapter-1/
│   ├── intro.twee
│   └── choices.twee
└── chapter-2/
    └── ...
```

### `src/assets/app/`

Your custom JavaScript/TypeScript and styles. The entry point is `index.ts`, which imports `styles/index.scss`. Add your own `.ts` files and import them from `index.ts`.

### `src/assets/fonts/`

Drop `.woff2`, `.woff`, `.ttf`, or `.otf` font files here. Reference them in your SCSS with a relative path — see [Fonts & Media](./fonts-and-media) for details.

### `src/assets/media/`

Static files like images and the favicon. These are copied directly to `dist/` during build. Reference them as `media/filename.png` in your story or head content.

### `src/assets/vendor/`

Third-party JavaScript files that aren't available as npm packages. Drop `.js` files here and import them from `index.ts`.

### `src/head-content.html`

Raw HTML that gets injected into the `<head>` of your compiled story. Useful for meta tags, analytics snippets, or external stylesheets.

## Config Files

### `vite.config.ts`

The Vite build configuration. It handles:

- Bundling your TypeScript and SCSS into `dist/scripts/` and `dist/styles/`
- Copying media files to `dist/`
- Compiling your Twee story into `dist/index.html` after bundling

You shouldn't need to edit this unless you're adding Vite plugins.

### `postcss.config.js`

Enables modern CSS features via [postcss-preset-env](https://github.com/csstools/postcss-preset-env) (nesting, custom media queries, etc.) and minification in production.

### `tsconfig.json`

TypeScript configuration with strict mode enabled. Scoped to `src/assets/app/` so it only checks your application code.

## Generated Files

These are created automatically and should not be edited by hand:

| Path            | Description                                              |
| --------------- | -------------------------------------------------------- |
| `dist/`         | Compiled output — your publishable story                 |
| `storyformats/` | Symlink to the Spindle format (created by `npm install`) |
| `node_modules/` | Installed dependencies                                   |

All three are listed in `.gitignore`.

## StoryData.twee

This file is required by every Twine story. It contains metadata that the compiler and story format need:

```txt
:: StoryData
{
  "ifid": "D674C58C-DEFA-4F70-B7A2-27742230C0FC",
  "format": "spindle",
  "format-version": "0.2.0"
}
```

| Field            | Description                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ifid`           | A unique identifier for your story ([IFID](https://ifdb.org/ifid)). The template includes one — keep it or generate a new UUID. |
| `format`         | The story format to use. Keep this as `spindle`.                                                                                |
| `format-version` | The minimum format version. The installed version will be used as long as it satisfies this.                                    |

::: warning
Don't delete `StoryData.twee` — the compiler needs it to know which story format to use.
:::
