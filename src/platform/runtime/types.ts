import type { AnyCapabilityContract, Args, Domain } from "../capability/contract.js";
import type { CallResult } from "../gateway/result.js";
import type { CallOptions } from "../task/plane.js";
import type { AgentTask, Proposal } from "../task/types.js";
import type { ReportView, UiView } from "../tenant/compose.js";
import type { TenantProfile } from "../tenant/profile.js";

export interface CatalogItem {
  name: string;
  intent: string;
  kind: "query" | "business_intent";
  irreversible: boolean;
}

export interface PlaybookHandle {
  call(capability: string, args: Args, options?: CallOptions): CallResult;
  preview(capability: string, args: Args): CallResult;
  contract(name: string): AnyCapabilityContract | undefined;
  catalog(namespace?: Domain): CatalogItem[];
}

/** @deprecated 用 PlaybookHandle。保留别名以免旧 demo 断裂。 */
export type ToolHandle = PlaybookHandle;

export interface ObserveHandle {
  query(capability: string, args?: Args): CallResult;
  profile(): TenantProfile;
  composeUi(): UiView;
  composeReport(facts?: Record<string, unknown>): ReportView;
  propose(capability: string, args: Args, reason: string): Proposal;
  contract(name: string): AnyCapabilityContract | undefined;
  catalog(namespace?: Domain): CatalogItem[];
  playbooks(namespace?: Domain): CatalogItem[];
}

export interface PlaybookRuntime {
  name: string;
  run(task: AgentTask, tools: PlaybookHandle): Promise<void> | void;
}

/** @deprecated 用 PlaybookRuntime */
export type TaskRuntime = PlaybookRuntime;

export interface ObserveRuntime {
  name: string;
  run(task: AgentTask, tools: ObserveHandle): Promise<void> | void;
}
