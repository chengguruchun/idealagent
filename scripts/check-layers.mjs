#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(root, "src", "platform");

const LAYERS = {
  backend: 0,
  capability: 1,
  grant: 2,
  tenant: 2,
  gateway: 3,
  task: 4,
  runtime: 5,
};

const COMPOSITION_ROOT = 99;
const IMPORT = /from\s+["'](\.[^"']+)["']/g;

function layerOf(absPath) {
  const rel = relative(base, absPath);
  const [head] = rel.split(sep);
  if (rel.includes("..")) return null;
  return head in LAYERS ? LAYERS[head] : COMPOSITION_ROOT;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of walk(base)) {
  const from = layerOf(file);
  if (from === null) continue;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(IMPORT)) {
    const target = resolve(dirname(file), match[1]).replace(/\.js$/, ".ts");
    const to = layerOf(target);
    if (to === null || to === COMPOSITION_ROOT) continue;
    if (to > from) {
      violations.push(
        `${relative(root, file)} (L${from}) → ${relative(root, target)} (L${to})`,
      );
    }
  }
}

const order = Object.entries(LAYERS)
  .sort((a, b) => a[1] - b[1])
  .map(([name, level]) => `L${level} ${name}`)
  .join("  →  ");

if (violations.length > 0) {
  console.error(`分层依赖必须向下：${order}\n`);
  for (const line of violations) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log(`分层依赖校验通过：${order}`);
