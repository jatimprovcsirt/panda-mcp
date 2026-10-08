import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  // The published binary must be directly executable via `npx` / the `bin` field.
  banner: { js: "#!/usr/bin/env node" },
  // Dependencies stay external; they are declared in package.json.
  skipNodeModulesBundle: true,
});
