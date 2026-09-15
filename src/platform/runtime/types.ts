import type { AnyCapabilityContract, Args, Domain } from "../capability/contract.js";
import type { CallResult } from "../gateway/result.js";
import type { CallOptions } from "../task/plane.js";
import type { AgentTask } from "../task/types.js";

export interface ToolHandle {
  call(capability: string, args: Args, options?: CallOptions): CallResult;
  preview(capability: string, args: Args): CallResult;
  contract(name: string): AnyCapabilityContract | undefined;
  catalog(namespace?: Domain): Array<{ name: string; intent: string; irreversible: boolean }>;
}

/**
 * runtime 是这套架构里唯一可替换的部分：
 * 规则、小模型、Pi 的 agent loop、人工，都实现同一个接口。
 * 它拿不到 backend，只能通过 ToolHandle 走网关。
 */
export interface TaskRuntime {
  name: string;
  run(task: AgentTask, tools: ToolHandle): Promise<void> | void;
}
