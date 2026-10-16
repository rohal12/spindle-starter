import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  initialHtml: '<html><style role="stylesheet" id="twine-user-stylesheet"></style></html>',
  browser: {
    init: vi.fn(), getOption: vi.fn(), reload: vi.fn(),
    sockets: { emit: vi.fn() }, exit: vi.fn(),
  },
  build: vi.fn(), watch: vi.fn(),
}));

vi.mock('vite', () => ({ build: state.build }));
vi.mock('browser-sync', () => ({ default: { create: () => state.browser } }));
vi.mock('@rohal12/twee-ts', () => ({ watch: state.watch }));
vi.mock('../.build/media.js', () => ({ watchMedia: () => () => {} }));
vi.mock('fs', () => ({ default: {
  existsSync: () => true, mkdirSync: vi.fn(), writeFileSync: vi.fn(),
  readFileSync: () => state.initialHtml,
} }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(process, 'on').mockReturnValue(process);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  state.build.mockResolvedValue({});
  state.watch.mockResolvedValue(new AbortController());
  state.browser.init.mockImplementation((_options, callback) => callback(null, state.browser));
  state.browser.getOption.mockImplementation(() => new Map([['local', 'http://localhost:4322']]));
  await import('../.build/dev.js');
  await vi.waitFor(() => expect(state.build).toHaveBeenCalledTimes(2));
});

afterEach(() => vi.restoreAllMocks());

test('reports the resolved BrowserSync URL after a port fallback', () => {
  expect(state.browser.getOption).toHaveBeenCalledWith('urls');
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:4322'));
});

test('an empty stylesheet becoming populated sends a CSS update', () => {
  const { onBuild } = state.watch.mock.calls[0][0];
  onBuild({
    diagnostics: [], stats: { passages: 1, words: 1 },
    output: state.initialHtml.replace('</style>', 'body { color: red; }</style>'),
  });
  expect(state.browser.sockets.emit).toHaveBeenCalledWith('spindle:css');
  expect(state.browser.reload).not.toHaveBeenCalled();
});

test.each([
  ['font', '@font-face { font-family: WatchFont; src: url(fonts/watch-font-HASH.woff2); }'],
  ['image', 'body { background-image: url(assets/watch-image-HASH.svg); }'],
])('a changed %s URL sends a CSS update without reloading the story', (_asset, css) => {
  const { onBuild } = state.watch.mock.calls[0][0];
  const result = (hash: string) => ({
    diagnostics: [], stats: { passages: 1, words: 1 },
    output: state.initialHtml.replace('</style>', `${css.replace('HASH', hash)}</style>`),
  });
  onBuild(result('old'));
  state.browser.sockets.emit.mockClear();
  state.browser.reload.mockClear();
  onBuild(result('new'));
  expect(state.browser.sockets.emit).toHaveBeenCalledExactlyOnceWith('spindle:css');
  expect(state.browser.reload).not.toHaveBeenCalled();
});

// Execute the exact browser snippet injected by the dev server. These small
// DOM doubles model Spindle's conditional author-style creation at startup.
async function player(css: string, hasAppliedStyle: boolean) {
  const source = { id: 'twine-user-stylesheet', textContent: css };
  const builtin = { id: 'spindle-styles', textContent: 'body { color: black; }' };
  const unrelated = { id: '', textContent: '' };
  const original = { id: '', textContent: css };
  const styles = [builtin, unrelated, ...(hasAppliedStyle ? [original] : [])];
  const reload = vi.fn();
  const handlers = new Map<string, () => void>();
  const fetch = vi.fn().mockResolvedValue({ text: async () => css });
  let poll: () => void;
  const document = {
    querySelector: () => source,
    createElement: () => ({ id: '', textContent: '' }),
    head: {
      querySelectorAll: () => styles,
      appendChild: (style: typeof original) => { styles.push(style); return style; },
    },
  };
  const options = state.browser.init.mock.calls[0][0];
  const snippet = options.rewriteRules[0].fn(null, null, '');
  runInNewContext(snippet.replace(/^<script>|<\/script>$/g, ''), {
    document, fetch,
    location: { href: 'http://localhost:4322', reload },
    window: { ___browserSync___: { socket: {
      on: (name: string, handler: () => void) => handlers.set(name, handler),
    } } },
    DOMParser: class {
      parseFromString(html: string) {
        return { querySelector: () => html === 'missing' ? null : { textContent: html } };
      }
    },
    setInterval: (callback: () => void) => { poll = callback; return 1; },
    clearInterval: () => {},
  });
  poll!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { styles, builtin, unrelated, original, reload, async update(next: string) {
    fetch.mockResolvedValue({ text: async () => next });
    handlers.get('spindle:css')!();
    await vi.waitFor(() => {
      expect(styles.at(-1)?.textContent === next || reload.mock.calls.length > 0).toBe(true);
    });
  } };
}

test('creates and reuses an author style after loading with empty CSS', async () => {
  const page = await player('', false);
  await page.update('body { color: red; }');
  const applied = page.styles.at(-1);
  expect(page.styles).toHaveLength(3);
  expect(page.builtin.textContent).toBe('body { color: black; }');
  expect(page.unrelated.textContent).toBe('');
  await page.update('');
  await page.update('body { color: blue; }');
  expect(page.styles.at(-1)).toBe(applied);
  expect(page.styles).toHaveLength(3);
  expect(page.reload).not.toHaveBeenCalled();
});

test('updates and restores an existing author style in place', async () => {
  const page = await player('body { color: red; }', true);
  await page.update('body { color: green; }');
  await page.update('');
  await page.update('body { color: blue; }');
  expect(page.styles.at(-1)).toBe(page.original);
  expect(page.reload).not.toHaveBeenCalled();
});

test('reloads if a nonempty applied stylesheet is unexpectedly missing', async () => {
  const page = await player('body { color: red; }', false);
  await page.update('body { color: blue; }');
  expect(page.reload).toHaveBeenCalledOnce();
});
