# Getting Started

This guide walks you through setting up Spindle Starter from scratch. By the end you'll have a running development server with live reload.

## Prerequisites

You need [Node.js](https://nodejs.org/) **22 or later**. Check your version:

```sh
node --version
# v22.x.x or higher
```

If you don't have Node.js installed, download it from [nodejs.org](https://nodejs.org/) — the LTS version is fine.

::: tip What is Node.js?
Node.js lets you run JavaScript outside the browser. Spindle Starter uses it to compile your story files and run the development server. You won't need to write any Node.js code yourself.
:::

## Create Your Project

[degit](https://github.com/Rich-Harris/degit) copies the starter template without git history, giving you a clean slate:

```sh
npx degit rohal12/spindle-starter my-story
```

Replace `my-story` with whatever you'd like to call your project. This creates a new folder with all the starter files.

## Install Dependencies

Move into your project folder and install:

```sh
cd my-story
npm install
```

This downloads everything the project needs — the Spindle story format, the twee-ts compiler, Vite, and other build tools. It also creates a symlink to the Spindle format so the compiler can find it.

## Start the Dev Server

```sh
npm start
```

This:

1. Builds your JavaScript, CSS, and story files
2. Starts a local server at `http://localhost:4321`
3. Opens your browser automatically
4. Watches for file changes and reloads

You should see your story open in the browser with the default "Hello World!" passage.

## Make Your First Edit

Open `src/story/Start.twee` in your editor and change the text:

```txt
:: StoryTitle
My First Story

:: Start
Welcome to my story!

This is the first passage. You can write anything here.

[[Go to the next passage|Second]]

:: Second
You made it to the second passage!

[[Go back|Start]]
```

Save the file. Your browser should reload automatically and show your changes.

## Commands Reference

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `npm start`             | Start development server with live reload |
| `npm run dev`           | Same as `npm start`                       |
| `npm run build`         | Production build to `dist/`               |
| `npm run preview`       | Preview the production build locally      |
| `npm run publish:pages` | Deploy to GitHub Pages                    |
| `npm run publish:itch`  | Deploy to itch.io                         |

## What's Next?

- [Project Structure](./project-structure) — understand what each file and folder does
- [Passages & Twee](./passages-and-twee) — learn the Twee syntax for writing stories
- [Styles & Scripts](./styles-and-scripts) — customize the look and behavior of your story
- [Publishing](./publishing) — share your story with the world
