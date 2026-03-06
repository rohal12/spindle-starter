# Fonts & Media

Spindle Starter has dedicated directories for fonts, images, and other static assets.

## Custom Fonts

Place font files in `src/assets/fonts/`. Supported formats: `.woff2`, `.woff`, `.ttf`, `.otf`.

Then reference them in your SCSS with a `@font-face` declaration:

```scss
// src/assets/app/styles/index.scss
@font-face {
  font-family: "MyFont";
  src: url("../../fonts/MyFont.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

body {
  font-family: "MyFont", serif;
}
```

The path is relative to the SCSS file's location (`src/assets/app/styles/`). Vite handles the font files automatically — they end up in `dist/fonts/` in the final build.

::: tip
Prefer `.woff2` files — they offer the best compression and are supported by all modern browsers.
:::

## Images and Media

Static files like images, audio, and video go in `src/assets/media/`. These are copied directly to `dist/` during build and served at the root level.

### Referencing from Head Content

In `src/head-content.html`, reference media files with the `media/` prefix:

```html
<link rel="icon" type="image/svg+xml" href="media/favicon.svg" />
```

### Referencing from Twee

In your Twee passages, use the same `media/` prefix:

```txt
:: Gallery
Here's a picture:

<img src="media/photo.jpg" alt="A photo" />
```

### Referencing from SCSS

In stylesheets, use a path relative to the SCSS file:

```scss
.header {
  background-image: url("../../media/banner.jpg");
}
```

## File Organization

```
src/assets/
├── fonts/
│   ├── MyFont-Regular.woff2
│   └── MyFont-Bold.woff2
├── media/
│   ├── favicon.svg
│   ├── banner.jpg
│   └── characters/
│       ├── hero.png
│       └── villain.png
└── vendor/
    └── some-library.js
```

Subdirectories inside `media/` work fine — just include the full path (`media/characters/hero.png`).

## What's Next?

- [Publishing](./publishing) — deploy your finished story to the web
