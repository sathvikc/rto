/**
 * Fails when sw.js APP_SHELL and the files that ship disagree, so the
 * offline cache never misses a module (or lists a deleted one).
 * Usage: node scripts/check-app-shell.js
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SHIPPED_DIRS = ["src", "vendor/lume-js"];
const SHIPPED_EXT = /\.(js|mjs|css)$/;
const ALWAYS = ["./", "index.html", "manifest.webmanifest"];

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))));

  return nested.flat();
}

const sw = await readFile(join(root, "sw.js"), "utf8");
const listed = new Set([...sw.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]));

const shipped = (await Promise.all(SHIPPED_DIRS.map(walk)))
  .flat()
  .filter((f) => SHIPPED_EXT.test(f))
  .map((f) => relative(root, join(root, f)));

const missing = shipped.filter((f) => !listed.has(f));
const stale = [...listed].filter((f) => !ALWAYS.includes(f) && !f.startsWith("assets/") && !shipped.includes(f));

if (missing.length || stale.length) {
  if (missing.length) console.error(`Missing from APP_SHELL in sw.js:\n  ${missing.join("\n  ")}`);
  if (stale.length) console.error(`Listed in APP_SHELL but not found:\n  ${stale.join("\n  ")}`);

  process.exit(1);
}

console.log(`APP_SHELL OK (${listed.size} entries)`);
