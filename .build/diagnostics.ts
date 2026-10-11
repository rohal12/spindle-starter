import type { CompileResult } from "@rohal12/twee-ts";

type Diagnostic = CompileResult["diagnostics"][number];

function format(d: Diagnostic): string {
  const where = d.file ? ` (${d.file}${d.line ? `:${d.line}` : ""})` : "";
  return `${d.message}${where}`;
}

/**
 * Print the compiler's diagnostics, warnings to stderr as warnings and errors
 * as errors. Returns the error messages so callers can decide whether the
 * build may continue.
 */
export function reportDiagnostics(diagnostics: readonly Diagnostic[]): string[] {
  const errors: string[] = [];
  for (const d of diagnostics) {
    if (d.level === "error") {
      errors.push(format(d));
      console.error(`[spindle] error: ${format(d)}`);
    } else {
      console.warn(`[spindle] warning: ${format(d)}`);
    }
  }
  return errors;
}
