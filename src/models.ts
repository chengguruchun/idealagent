type ModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  api: "openai-completions";
  apiKey: string;
  compat?: Record<string, unknown>;
  models: ModelConfig[];
}

export const DEFAULT_MODELS_FILE = {
  providers: {
    dashscope: {
      name: "DashScope",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      api: "openai-completions",
      apiKey: "$DASHSCOPE_API_KEY",
      compat: { thinkingFormat: "qwen" },
      models: [
        model("qwen-plus", "Qwen Plus"),
        model("qwen-max", "Qwen Max"),
        model("qwen-turbo", "Qwen Turbo"),
      ],
    },
    deepseek: {
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      api: "openai-completions",
      apiKey: "$DEEPSEEK_API_KEY",
      compat: { thinkingFormat: "deepseek" },
      models: [
        model("deepseek-chat", "DeepSeek Chat"),
        model("deepseek-reasoner", "DeepSeek Reasoner", true),
      ],
    },
  } satisfies Record<string, ProviderConfig>,
};

export const PROVIDER_KEYS = [
  { provider: "dashscope", env: "DASHSCOPE_API_KEY", model: "qwen-plus" },
  { provider: "deepseek", env: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  { provider: "openai", env: "OPENAI_API_KEY", model: "gpt-4o-mini" },
] as const;

function model(id: string, name: string, reasoning = false): ModelConfig {
  return {
    id,
    name,
    reasoning,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}
