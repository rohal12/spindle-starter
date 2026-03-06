# Passages & Twee

Spindle stories are written in **Twee**, a plain-text format for interactive fiction. Each story is made up of **passages** — self-contained blocks of text that the reader navigates between.

## Passage Syntax

A passage starts with a header line (`::` followed by the passage name), and everything below it is the passage content:

```txt
:: Passage Name
This is the content of the passage.

It can span multiple lines.
```

## Links

Links let the reader move between passages. There are several ways to write them:

```txt
:: Start
You wake up in a dark room.

[[Look around]]
[[Open the door|Hallway]]
[[Check your pockets->Inventory]]
```

| Syntax | Display Text | Goes To |
|--------|-------------|---------|
| `[[Look around]]` | Look around | Look around |
| `[[Open the door\|Hallway]]` | Open the door | Hallway |
| `[[Check your pockets->Inventory]]` | Check your pockets | Inventory |

The first form uses the passage name as the link text. The other two let you show different text than the passage you're linking to.

## Tags

Passages can have tags, written in square brackets after the name:

```txt
:: Kitchen [location visited]
You're in the kitchen. There's a fridge and a stove.
```

Tags are useful for categorization and can be used by the story format for special behavior. Consult the [Spindle documentation](https://rohal12.github.io/spindle/) for details on supported tags.

## Special Passages

Some passage names have special meaning:

| Passage | Purpose |
|---------|---------|
| `StoryTitle` | The title shown in the browser tab and story UI |
| `StoryData` | JSON metadata (IFID, format, format-version) |
| `Start` | The first passage the reader sees (default) |

```txt
:: StoryTitle
My Adventure

:: Start
The story begins here.
```

## Organizing Files

You can split your story across as many `.twee` files as you want. The compiler finds them all recursively inside `src/story/`. A common pattern:

```
src/story/
├── StoryData.twee          # Metadata
├── Start.twee              # Opening passages
├── locations/
│   ├── town.twee
│   ├── forest.twee
│   └── castle.twee
└── characters/
    ├── merchant.twee
    └── guard.twee
```

The file names and folder structure don't affect the story — only the passage names inside them matter. Organize however makes sense to you.

## Twee 3 Specification

Spindle Starter uses the [Twee 3](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-spec.md) format. If you've used Twine's visual editor before, Twee is simply the text representation of the same thing — each "card" in Twine is a passage in Twee.

## What's Next?

- [Styles & Scripts](./styles-and-scripts) — change how your story looks and behaves
- [Fonts & Media](./fonts-and-media) — add custom fonts, images, and other assets
- [Spindle Documentation](https://rohal12.github.io/spindle/) — full reference for the Spindle story format
