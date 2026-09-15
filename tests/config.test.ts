import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { detectDefaultModel, prepareIdealAgent } from "../src/config.ts";
import { DEFAULT_MODELS_FILE } from "../src/models.ts";

test("default models.json includes dashscope and deepseek", () => {
  assert.ok(DEFAULT_MODELS_FILE.providers.dashscope);
  assert.ok(DEFAULT_MODELS_FILE.providers.deepseek);
  assert.equal(DEFAULT_MODELS_FILE.providers.dashscope.api, "openai-completions");
});

test("prepareIdealAgent writes models.json once", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "idealagent-"));
  const first = prepareIdealAgent({ cwd: agentDir, agentDir });
  const second = prepareIdealAgent({ cwd: agentDir, agentDir });
  assert.equal(first.agentDir, second.agentDir);
  const written = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf8"));
  assert.ok(written.providers.dashscope.models.some((m: { id: string }) => m.id === "qwen-plus"));
});

test("detectDefaultModel prefers dashscope then deepseek then openai", () => {
  assert.deepEqual(detectDefaultModel({ dashscope: "sk" }), {
    provider: "dashscope",
    model: "qwen-plus",
  });
  assert.deepEqual(detectDefaultModel({ openai: "sk" }), {
    provider: "openai",
    model: "gpt-4o-mini",
  });
});
