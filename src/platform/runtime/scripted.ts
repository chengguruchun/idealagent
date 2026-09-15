import type { Args } from "../capability/contract.js";
import type { CallOptions } from "../task/plane.js";
import type { AgentTask } from "../task/types.js";
import type { TaskRuntime, ToolHandle } from "./types.js";

export interface ScriptedStep {
  capability: string;
  args: Args;
  options?: CallOptions;
  /** 上一步失败时是否继续，默认中断。 */
  continueOnFailure?: boolean;
}

/** 固定剧本执行器，用来在没有模型的情况下验证网关与任务面。 */
export function scriptedRuntime(steps: ScriptedStep[], name = "scripted"): TaskRuntime {
  return {
    name,
    run(task: AgentTask, tools: ToolHandle) {
      for (const step of steps) {
        const result = tools.call(step.capability, step.args, step.options);
        const failed = result.status !== "ok" && result.status !== "replayed" && result.status !== "dry_run";
        if (failed && !step.continueOnFailure) return;
      }
    },
  };
}

/** 任意闭包执行器，Pi 的 agent loop 接进来时占的就是这个位置。 */
export function functionRuntime(
  name: string,
  fn: (task: AgentTask, tools: ToolHandle) => Promise<void> | void,
): TaskRuntime {
  return { name, run: fn };
}
