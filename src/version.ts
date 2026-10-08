/**
 * Package version.
 *
 * Kept as a literal rather than imported from package.json so the bundler
 * does not have to inline the whole manifest (including the scripts block)
 * into the published binary. `scripts/check-version.ts` fails the build if
 * this drifts from package.json.
 */
export const VERSION = "0.1.0";
