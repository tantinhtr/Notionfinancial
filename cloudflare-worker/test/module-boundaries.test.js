import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith(".js") ? [path] : [];
  }))).flat();
}
function imports(source) {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)].map(match => match[1]);
}
function feature(path) {
  return /^features\/([^/]+)\//.exec(path)?.[1];
}

test("production consumers use feature public entry points and features cannot import each other", async () => {
  for (const file of await files(root)) {
    const origin = relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    for (const specifier of imports(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = relative(root, resolve(dirname(file), specifier)).replaceAll("\\", "/");
      const fromFeature = feature(origin), toFeature = feature(target);
      if (fromFeature && toFeature && fromFeature !== toFeature && toFeature !== "shared") {
        assert.fail(origin + " imports another feature: " + target);
      }
      if (toFeature && toFeature !== "shared" && fromFeature !== toFeature) {
        assert.equal(target, "features/" + toFeature + "/index.js", origin + " bypasses the public API");
      }
      if (fromFeature && !(
        /^features\/(cashflow|fund-budget|income-goal)\/(index|repository)\.js$/.test(origin)
        && !/\bimport\s/.test(source) && target.startsWith("repositories/")
      )) {
        assert.equal(/^(adapters|app|repositories|jobs)\//.test(target), false, origin + " imports infrastructure");
      }
      if (origin.startsWith("adapters/")) {
        assert.equal(/^(app|features|repositories|jobs|services)\//.test(target), false, origin + " imports application code");
      }
    }
  }
});

test("domain, shared helpers, models and presenters have no external I/O dependencies", async () => {
  for (const file of await files(root)) {
    const origin = relative(root, file).replaceAll("\\", "/");
    if (!origin.startsWith("domain/") && !origin.startsWith("features/shared/")
      && !/\/(model|presenter|callbacks)\.js$/.test(origin)) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:Date\.now|Math\.random)\s*\(/, origin + " is not deterministic");
    for (const specifier of imports(source)) {
      assert.equal(specifier.startsWith("."), true, origin + " imports a platform dependency");
      const target = relative(root, resolve(dirname(file), specifier)).replaceAll("\\", "/");
      assert.equal(/^(app|adapters|repositories|jobs|services)\//.test(target)
        || /\/(repository|component|six-jar-sync|index)\.js$/.test(target), false, origin + " imports I/O orchestration");
    }
  }
});
