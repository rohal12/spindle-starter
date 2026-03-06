# Styles & Scripts

Spindle Starter uses Vite to bundle your styles and scripts, which are then injected into the compiled story.

## Styles

The main stylesheet is at `src/assets/app/styles/index.scss`. It's written in [Sass](https://sass-lang.com/) (SCSS syntax) and processed through [PostCSS](https://postcss.org/) with modern CSS features enabled.

### Editing Styles

Open `src/assets/app/styles/index.scss` and add your CSS:

```scss
// Change the body background
body {
  background: #1a1a2e;
  color: #eee;
  font-family: "Georgia", serif;
}

// Style links
a {
  color: #e94560;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
```

Save the file and the browser will inject the new styles without a full page reload.

### Modern CSS Features

PostCSS preset-env is configured, so you can use modern CSS features that automatically get compiled for older browsers:

```scss
// Nesting (native CSS nesting syntax)
.passage {
  padding: 2rem;

  & h1 {
    font-size: 2em;
  }
}

// Custom media queries
@custom-media --mobile (max-width: 768px);

@media (--mobile) {
  body {
    padding: 1rem;
  }
}
```

### Multiple Stylesheets

You can split your styles across multiple files and import them:

```scss
// src/assets/app/styles/index.scss
@use "variables";
@use "layout";
@use "passages";
```

```scss
// src/assets/app/styles/_variables.scss
$bg-color: #1a1a2e;
$text-color: #eee;
$accent: #e94560;
```

## Scripts

The JavaScript/TypeScript entry point is `src/assets/app/index.ts`. By default it only imports the stylesheet:

```typescript
import "./styles/index.scss";
```

### Adding Custom Code

Add your own TypeScript or JavaScript files and import them:

```typescript
// src/assets/app/index.ts
import "./styles/index.scss";
import "./my-module";
```

```typescript
// src/assets/app/my-module.ts
console.log("Story loaded!");

// Access the Spindle Story API
window.Story; // typed via globals.d.ts
```

### TypeScript

TypeScript is fully supported with strict mode enabled. The `globals.d.ts` file provides types for the Spindle `Story` API on the window object. Add your own type declarations there as needed.

### Third-Party Scripts

For scripts that aren't available as npm packages, drop `.js` files into `src/assets/vendor/` and import them:

```typescript
// src/assets/app/index.ts
import "../vendor/some-library.js";
```

For npm packages, install them normally and import:

```sh
npm install some-package
```

```typescript
import something from "some-package";
```

## How the Build Works

When you run `npm start` or `npm run build`:

1. **Vite** bundles `src/assets/app/index.ts` and all its imports into `dist/scripts/app.bundle.js` and `dist/styles/app.bundle.css`
2. **twee-ts** compiles your `.twee` files into `dist/index.html`, injecting the bundled script and stylesheet into the `<head>`

The development server watches both sides — Vite rebuilds assets on script/style changes, and twee-ts incrementally recompiles on `.twee` file changes.

## Head Content

For things that need to go directly in `<head>` (meta tags, external scripts, analytics), edit `src/head-content.html`:

```html
<link rel="icon" type="image/svg+xml" href="media/favicon.svg" />
<meta name="description" content="An interactive story built with Spindle" />
```

This file is injected as-is into the compiled HTML.

## What's Next?

- [Fonts & Media](./fonts-and-media) — add custom fonts, images, and other assets
- [Publishing](./publishing) — deploy your finished story
