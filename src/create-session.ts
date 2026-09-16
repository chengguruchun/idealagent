import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  type CreateAgentSessionOptions,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";

import { prepareIdealAgent } from "./config.js";

export interface CreateIdealAgentOptions {
  cwd?: string;
  agentDir?: string;
  provider?: string;
  model?: string;
  tools?: string[];
  noTools?: CreateAgentSessionOptions["noTools"];
  customTools?: CreateAgentSessionOptions["customTools"];
  thinkingLevel?: CreateAgentSessionOptions["thinkingLevel"];
  sessionManager?: CreateAgentSessionOptions["sessionManager"];
  persist?: boolean;
  systemPrompt?: string | ((base: string | undefined) => string | undefined);
  extensions?: InlineExtension[];
  resourceLoader?: CreateAgentSessionOptions["resourceLoader"];
  modelRuntime?: ModelRuntime;
}

export async function createIdealAgent(options: CreateIdealAgentOptions = {}) {
  const prepared = prepareIdealAgent({
    cwd: options.cwd,
    agentDir: options.agentDir,
  });

  const modelRuntime =
    options.modelRuntime ??
    (await ModelRuntime.create({
      authPath: join(prepared.agentDir, "auth.json"),
      modelsPath: join(prepared.agentDir, "models.json"),
    }));

  for (const [provider, key] of Object.entries(prepared.keys)) {
    await modelRuntime.setRuntimeApiKey(provider, key);
  }

  const provider = options.provider ?? prepared.defaultProvider;
  const modelId = options.model ?? prepared.defaultModel;
  const model =
    provider && modelId ? modelRuntime.getModel(provider, modelId) : undefined;

  let resourceLoader = options.resourceLoader;
  if (!resourceLoader) {
    const systemPromptOverride =
      typeof options.systemPrompt === "function"
        ? options.systemPrompt
        : options.systemPrompt
          ? () => options.systemPrompt as string
          : undefined;
    const loader = new DefaultResourceLoader({
      cwd: prepared.cwd,
      agentDir: prepared.agentDir,
      systemPromptOverride,
      extensionFactories: options.extensions,
    });
    await loader.reload();
    resourceLoader = loader;
  }

  const sessionManager =
    options.sessionManager ??
    (options.persist === false
      ? SessionManager.inMemory()
      : SessionManager.create(prepared.cwd));

  const result = await createAgentSession({
    cwd: prepared.cwd,
    agentDir: prepared.agentDir,
    model: model ?? undefined,
    thinkingLevel: options.thinkingLevel,
    modelRuntime,
    resourceLoader,
    tools: options.tools,
    noTools: options.noTools,
    customTools: options.customTools,
    sessionManager,
  });

  return {
    ...result,
    agentDir: prepared.agentDir,
    modelRuntime,
  };
}

export type IdealAgent = Awaited<ReturnType<typeof createIdealAgent>>;
