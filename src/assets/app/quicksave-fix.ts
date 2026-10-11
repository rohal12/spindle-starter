import { onStoryStartup } from "./startup";

/**
 * Spindle 0.51's {quicksave} button passes the click event to Story.save() as
 * its slot argument. The event cannot be stored, so clicking the button logs a
 * DataCloneError and saves nothing. Until the format is fixed, handle the click
 * here and call Story.save() without arguments (the F5 hotkey is unaffected).
 *
 * Delete this file and its import in index.ts once the minimum Spindle version
 * in package.json includes the fix.
 */
onStoryStartup((Story) => {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button[title^="Quick Save"]');
      if (!button) return;
      event.stopImmediatePropagation();
      if (!button.disabled) void Story.save();
    },
    true,
  );
});
