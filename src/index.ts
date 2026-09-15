export {
  createAgentSession,
  createAgentSessionRuntime,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  main,
} from "@earendil-works/pi-coding-agent";
export type {
  CreateAgentSessionOptions,
  ExtensionAPI,
  InlineExtension,
} from "@earendil-works/pi-coding-agent";

export { createIdealAgent } from "./create-session.js";
export type { CreateIdealAgentOptions, IdealAgent } from "./create-session.js";

export {
  AGENT_DIR_ENV,
  defaultAgentDir,
  detectDefaultModel,
  detectKeys,
  loadEnv,
  prepareIdealAgent,
} from "./config.js";
export type { PreparedRuntime } from "./config.js";
export { DEFAULT_MODELS_FILE, PROVIDER_KEYS } from "./models.js";

export { createSaasAgent } from "./saas/pipeline.js";
export type { EventKind, PipelineResult, SaaSEvent } from "./saas/types.js";

export * as platform from "./platform/index.js";
