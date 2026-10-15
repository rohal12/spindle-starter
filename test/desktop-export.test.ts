import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const script = readFileSync(new URL('../pack/tauri/desktop-export.js', import.meta.url), 'utf8');

function desktop(invoke = vi.fn().mockResolvedValue('/chosen/save.json')) {
  class Anchor {
    href = 'https://example.com';
    download = '';
    nativeClick = vi.fn();
    hasAttribute(name: string) { return name === 'download' && !!this.download; }
    click() { this.nativeClick(); }
  }
  const status = vi.fn().mockResolvedValue(undefined);
  const nativeInvoke = (command: string, args: unknown) => command === 'export_status'
    ? status(args) : invoke(command, args);
  const listeners: Record<string, (event: unknown) => void> = {};
  const context = {
    window: { __TAURI_INTERNALS__: { invoke: nativeInvoke } }, HTMLAnchorElement: Anchor,
    document: { addEventListener: (event: string, handler: (event: unknown) => void) => { listeners[event] = handler; } },
    fetch, Uint8Array,
  };
  runInNewContext(script, context);
  return { Anchor, invoke, status, listeners };
}

test('desktop exports the Blob bytes even when Spindle immediately revokes its URL', async () => {
  const { Anchor, invoke, status } = desktop();
  const content = JSON.stringify({ title: 'A story', state: { text: 'こんにちは' } });
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = new Anchor();
  anchor.href = url;
  anchor.download = 'save-story.json';
  anchor.click();
  URL.revokeObjectURL(url);
  await vi.waitFor(() => expect(status).toHaveBeenCalledWith({ message: 'Save exported to /chosen/save.json' }));
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_save', {
    name: 'save-story.json', data: Array.from(new TextEncoder().encode(content)),
  });
  expect(anchor.nativeClick).not.toHaveBeenCalled();
});

test.each([
  [null, 'Save export cancelled. No file was saved.'],
  [new Error('Disk full'), 'Save export failed: Error: Disk full'],
])('desktop reports a cancelled or failed native export: %s', async (result, message) => {
  const invoke = result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result);
  const { Anchor, status } = desktop(invoke);
  const anchor = new Anchor();
  anchor.href = URL.createObjectURL(new Blob(['save']));
  anchor.download = 'save.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  await vi.waitFor(() => expect(status).toHaveBeenCalledWith({ message }));
});

test('normal links and non-Blob downloads keep their normal click behavior', () => {
  const { Anchor, invoke } = desktop();
  const anchor = new Anchor();
  anchor.click();
  anchor.download = 'file.json';
  anchor.click();
  expect(anchor.nativeClick).toHaveBeenCalledTimes(2);
  expect(invoke).not.toHaveBeenCalled();
});

test('a player-clicked Blob download is handled by the native picker', async () => {
  const { Anchor, invoke, listeners } = desktop();
  const anchor = new Anchor();
  anchor.href = URL.createObjectURL(new Blob(['save']));
  anchor.download = 'save.json';
  const event = { target: { closest: () => anchor }, preventDefault: vi.fn() };
  listeners.click(event);
  URL.revokeObjectURL(anchor.href);
  expect(event.preventDefault).toHaveBeenCalled();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
});
