import { build } from "esbuild"

const hermes = process.argv.includes("--hermes")
await build({
  entryPoints: ["browser-entry.mjs"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: hermes ? "es2017" : "es2020",
  supported: hermes ? { "dynamic-import": false } : undefined,
  minify: true,
  outfile: hermes ? "dist/browser-hermes.js" : "dist/browser.js",
})
