export { Platform } from "./platform.js";
export type { ObserveResult, OperateResult, PlatformOptions } from "./platform.js";

export type {
  CommerceBackend,
  Coupon,
  LedgerEntry,
  Order,
  OrderStatus,
  Product,
  Ticket,
} from "./backend/types.js";
export { InMemoryCommerce, seedCommerce } from "./backend/in-memory.js";

export {
  DOMAINS,
  defineCapability,
} from "./capability/contract.js";
export type {
  AnyCapabilityContract,
  CapabilityContract,
  CapabilityContext,
  CompensationPlan,
  Domain,
  Effect,
  Precondition,
} from "./capability/contract.js";
export { CapabilityRegistry } from "./capability/registry.js";
export {
  catalogList,
  catalogUpdatePrice,
  channelTalents,
  channelTrends,
  crmReport,
  defaultRegistry,
  marketingCreateCoupon,
  orderQuery,
  orderRefund,
  supportReply,
} from "./capability/catalog/index.js";

export { GrantIssuer } from "./grant/issuer.js";
export { checkGrant } from "./grant/check.js";
export { FILTERS } from "./grant/filters.js";
export type { Grant, GrantConstraints, GrantVerdict } from "./grant/types.js";

export { TenantDirectory } from "./tenant/directory.js";
export { composeReport, composeUi } from "./tenant/compose.js";
export { defaultProfile } from "./tenant/profile.js";
export type { TenantProfile, TenantProfilePatch } from "./tenant/profile.js";
export type { ReportView, UiView } from "./tenant/compose.js";

export { ExecutionGateway } from "./gateway/execute.js";
export type { ApprovalRequest } from "./gateway/execute.js";
export { AuditLog } from "./gateway/audit.js";
export { BudgetLedger } from "./gateway/budget.js";
export { IdempotencyStore } from "./gateway/idempotency.js";
export { Saga } from "./gateway/saga.js";
export { isSuccess } from "./gateway/result.js";
export type { AuditRecord, CallResult, CallStatus, CapabilityCall } from "./gateway/result.js";

export { TaskPlane } from "./task/plane.js";
export type { AdmitOptions, CallOptions } from "./task/plane.js";
export { condition } from "./task/types.js";
export type {
  AgentTask,
  Outcome,
  OutcomeCheck,
  Proposal,
  RuntimeClass,
  TaskCondition,
  TaskPhase,
} from "./task/types.js";
export * as checks from "./task/checks.js";

export {
  functionObserveRuntime,
  functionRuntime,
  scriptedRuntime,
} from "./runtime/scripted.js";
export { defaultOperateRuntime } from "./runtime/operate.js";
export {
  dispatchObserveTool,
  OBSERVE_TOOL_NAMES,
  observeSystemPrompt,
} from "./runtime/observe-bridge.js";
export type {
  ObserveHandle,
  ObserveRuntime,
  PlaybookHandle,
  PlaybookRuntime,
  TaskRuntime,
  ToolHandle,
} from "./runtime/types.js";
