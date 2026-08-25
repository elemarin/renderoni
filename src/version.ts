/**
 * Single source of truth for the public Renderoni package version.
 *
 * Browser bundles and other in-package consumers cannot read `package.json` at
 * runtime, so this constant mirrors its `"version"` field. Keep both values in
 * sync on every release (a package-contract test enforces this).
 */
export const RENDERONI_VERSION = '1.0.0';
