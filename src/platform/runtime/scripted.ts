import type { Args } from "../capability/contract.js";
import type { CallOptions } from "../task/plane.js";
import type { AgentTask } from "../task/types.js";
import type { ObserveHandle, ObserveRuntime, PlaybookHandle, PlaybookRuntime } from "./types.js";

export interface ScriptedStep {
  capability: string;
  args: Args;
  options?: CallOptions;
  continueOnFailure?: boolean;
}

export function scriptedRuntime(steps: ScriptedStep[], name = "scripted"): PlaybookRuntime {
  return {
    name,
    run(_task: AgentTask, tools: PlaybookHandle) {
      for (const step of steps) {
        const result = tools.call(step.capability, step.args, step.options);
        const failed = result.status !== "ok" && result.status !== "replayed" && result.status !== "dry_run";
        if (failed && !step.continueOnFailure) return;
      }
    },
  };
}

export function functionRuntime(
  name: string,
  fn: (task: AgentTask, tools: PlaybookHandle) => Promise<void> | void,
): PlaybookRuntime {
  return { name, run: fn };
}

export function functionObserveRuntime(
  name: string,
  fn: (task: AgentTask, tools: ObserveHandle) => Promise<void> | void,
): ObserveRuntime {
  return { name, run: fn };
}
