import type { StoryAPI } from "@rohal12/spindle";

/**
 * Run `callback` once the Spindle `Story` API exists.
 *
 * The app bundle is injected into <head>, so it runs before Spindle boots and
 * `window.Story` is still undefined while your top-level code executes. Spindle
 * installs the API and then fires `:storystartup`, just before `StoryInit` runs
 * and the `storyinit` event fires, so listeners registered here still see
 * `storyinit`.
 */
export function onStoryStartup(callback: (story: StoryAPI) => void): void {
  if (window.Story) {
    callback(window.Story);
    return;
  }
  document.addEventListener(":storystartup", () => callback(window.Story), {
    once: true,
  });
}
