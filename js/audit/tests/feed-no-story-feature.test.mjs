import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "feed.html"), "utf8");
const runtime = readFileSync(join(root, "js/feed-runtime-04-1.js"), "utf8");
test("Feed has no Story section, viewer, or composer", () => {
  for (const id of ["storiesRow", "storyViewer", "storyOverlay", "storyActionsOverlay", "storyPublishLoader"]) assert.equal(html.includes(`id="${id}"`), false, `${id} must be absent`);
  assert.equal(html.includes("class=\"card story-section\""), false);
});
test("Story feature assets and tests are removed", () => {
  for (const file of ["css/spike-story-compact-v1.css", "css/spike-story-upload-v3.css", "js/audit/tests/story-upload-v3.test.mjs"]) assert.equal(existsSync(join(root,file)), false, `${file} must be absent`);
});
test("Story feed runtime is removed", () => {
  assert.doesNotMatch(runtime, /\b(?:loadStories|renderStories|storyViewed|state\.stories)\b/);
});
