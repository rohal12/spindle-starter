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
