import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

import { DEFAULT_MODELS_FILE, PROVIDER_KEYS } from "./models.js";

export const AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

export interface PreparedRuntime {
  cwd: string;
  agentDir: string;
  keys: Record<string, string>;
  defaultProvider?: string;
  defaultModel?: string;
}

export function defaultAgentDir(): string {
  return process.env[AGENT_DIR_ENV]?.trim() || join(homedir(), ".idealagent");
}

export function loadEnv(cwd: string = process.cwd()): void {
  loadDotenv({ path: join(cwd, ".env") });
}

export function detectKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const item of PROVIDER_KEYS) {
    const value = process.env[item.env]?.trim();
    if (value) keys[item.provider] = value;
  }
  return keys;
}

export function detectDefaultModel(keys: Record<string, string>): {
  provider?: string;
  model?: string;
} {
  for (const item of PROVIDER_KEYS) {
    if (keys[item.provider]) {
      return { provider: item.provider, model: item.model };
    }
  }
  return { provider: "dashscope", model: "qwen-plus" };
}

export function prepareIdealAgent(options: {
  cwd?: string;
  agentDir?: string;
} = {}): PreparedRuntime {
  const cwd = resolve(options.cwd ?? process.cwd());
  loadEnv(cwd);
  const agentDir = resolve(options.agentDir ?? defaultAgentDir());
  mkdirSync(agentDir, { recursive: true });

  const modelsPath = join(agentDir, "models.json");
  if (!existsSync(modelsPath)) {
    writeFileSync(modelsPath, `${JSON.stringify(DEFAULT_MODELS_FILE, null, 2)}\n`);
  }

  const keys = detectKeys();
  const detected = detectDefaultModel(keys);
  const settingsPath = join(agentDir, "settings.json");
  if (!existsSync(settingsPath) && detected.provider && detected.model) {
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          defaultProvider: detected.provider,
          defaultModel: detected.model,
        },
        null,
        2,
      )}\n`,
    );
  }

  process.env[AGENT_DIR_ENV] = agentDir;
  return {
    cwd,
    agentDir,
    keys,
    defaultProvider: detected.provider,
    defaultModel: detected.model,
  };
}
