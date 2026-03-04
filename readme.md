<img src="src/assets/media/favicon.svg" width="120" align="right" />

# Spindle Starter

The easiest starter kit for building [Spindle](https://rohal12.github.io/spindle/) stories with [twee-ts](https://github.com/rohal12/twee-ts).

## Features

- No binary downloads — pure npm packages
- Automatic Builds
- Live Reload with Browser-Sync
- CSS Injection (no full reload)
- Directory for custom fonts
- Directory for third-party scripts
- Up to date packages and frameworks

## Tech Stack

- [Spindle](https://rohal12.github.io/spindle/) — Preact-based Twine story format
- [twee-ts](https://github.com/rohal12/twee-ts) — TypeScript Twee compiler
- [Vite](https://vitejs.dev/) — Fast build tooling
- [TypeScript](https://www.typescriptlang.org/)
- [Sass](https://sass-lang.com/) with [Modern CSS Support](https://github.com/csstools/postcss-preset-env#readme)
- [Browser-Sync](https://browsersync.io/) — Live reloading

## Requirements

- [Node.js](https://nodejs.org/en/) 22+

## Getting Started

1. Clone the repository
   ```
   npx degit nijikokun/sugarcube-starter <project-name>
   ```
2. Install modules
   ```
   npm install
   ```
3. Start developing
   ```
   npm start
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start development server with live reload |
| `npm run dev` | Same as `npm start` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

## Directory Structure

```
.build/              # Build scripts
└── dev.ts           # Development server

src/                 # Source files
├── assets/
│   ├── app/         # Your JS/TS and SCSS
│   │   ├── index.ts
│   │   └── styles/
│   ├── fonts/       # Custom fonts
│   ├── media/       # Images and videos
│   └── vendor/      # Third-party scripts
├── story/           # Twine .twee files
└── head-content.html

dist/                # Compiled output (auto-generated)
storyformats/        # Symlink to spindle format (auto-generated)
```

## How To

<details>
<summary>How do I disable Test Mode?</summary>
<p>

Test mode is automatically enabled in development and disabled in production builds (`npm run build`).

</p>
</details>

---

<details>
<summary>How do I link to media files?</summary>
<p>

To reference images at `src/assets/media/<asset_path>`:

- `src/assets/media/favicon.png` → `media/favicon.png`

Example in HTML:

```html
<link rel="icon" type="image/png" href="media/favicon.png" />
```

</p>
</details>

---

<details>
<summary>How do I add Google Analytics?</summary>
<p>

Paste into [`src/head-content.html`](./src/head-content.html):

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=YOUR_TAG_HERE"></script>
```

Replace `YOUR_TAG_HERE` with your Google Analytics ID.

</p>
</details>

## Resources

- [Spindle Documentation](https://rohal12.github.io/spindle/)
- [twee-ts Documentation](https://github.com/rohal12/twee-ts)
- [Twee 3 Specification](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-spec.md)

## Acknowledgements

Based on [sugarcube-starter](https://github.com/nijikokun/sugarcube-starter) by [@nijikokun](https://github.com/nijikokun) (Nijiko Yonskai).

Thanks also to these individuals for their ideas and contributions.

- [@ryceg](https://github.com/ryceg)
- [@cyrusfirheir](https://github.com/cyrusfirheir)

## License

Licensed under the [Unlicense](https://unlicense.org/).
