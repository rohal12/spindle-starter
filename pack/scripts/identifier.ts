/**
 * Tauri bundle identifiers allow only letters, digits, hyphens and dots, while
 * Android application IDs (Java package names) allow underscores but not
 * hyphens. Derive both from the one configured identifier.
 */
export function tauriIdentifier(identifier: string): string {
  return identifier.replace(/_/g, '-');
}

export function androidApplicationId(identifier: string): string {
  return identifier.replace(/-/g, '_');
}

/**
 * A file name for build artifacts derived from the display name. The display
 * name may contain anything (`Love/Hate`, `What?`), but the artifact has to
 * land directly in its target directory with a name every OS accepts.
 */
export function artifactName(name: string): string {
  const safe = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (safe === '') return 'story';
  // Windows reserves device names even with extensions (CON.txt), including
  // the superscript digits recognized as COM/LPT device numbers.
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}
