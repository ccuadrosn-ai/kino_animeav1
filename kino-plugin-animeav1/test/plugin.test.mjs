// Offline test: answers come from test/fixtures.json (record them with
//   node sdk/run.mjs --record test/fixtures.json . search "naruto"
//   node sdk/run.mjs --record test/fixtures.json . episodes naruto
//   node sdk/run.mjs --record test/fixtures.json . resolve "naruto|1").
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "test", "fixtures.json");
const skip = !existsSync(fixtures) && "record test/fixtures.json first";

test("Kino accepts the manifest and the exports", async () => {
  const r = await validate(root);
  assert.deepEqual(r.problems, []);
});

test("search answers offline, and Kino drops nothing", { skip }, async () => {
  const r = await validate(root, { run: "search", args: ["naruto"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.drops, []);
  assert.ok(r.output.items.length > 0);
});

test("episodes answer offline, and Kino drops nothing", { skip }, async () => {
  const r = await validate(root, { run: "episodes", args: ["naruto"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.drops, []);
  assert.ok(r.output.episodes.length > 0);
});

test("resolve answers offline with a playable stream", { skip }, async () => {
  const r = await validate(root, { run: "resolve", args: ["naruto|1"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.ok(r.output.url.startsWith("https://"));
});
