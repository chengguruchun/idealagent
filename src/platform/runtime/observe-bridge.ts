import type { Args } from "../capability/contract.js";
import type { AgentTask } from "../task/types.js";
import type { ObserveHandle } from "./types.js";

export const OBSERVE_TOOL_NAMES = [
  "shop_catalog",
  "shop_playbooks",
  "shop_profile",
  "shop_query",
  "shop_compose_ui",
  "shop_compose_report",
  "shop_propose",
] as const;

export type ObserveToolName = (typeof OBSERVE_TOOL_NAMES)[number];

export function observeSystemPrompt(task: AgentTask): string {
  return [
    "你是 SaaS 店铺的观察车道 runtime，不是执行引擎。",
    `当前 AgentTask.goal：${task.spec.goal}`,
    `tenantId=${task.spec.tenantId} runtimeClass=observe`,
    "规则：",
    "1. 只能使用观察工具。禁止 bash / 读仓库 / 写文件 / 直接改订单。",
    "2. 先 shop_profile 和 shop_catalog，再 shop_query 取数，再 shop_compose_ui / shop_compose_report。",
    "3. 写操作只能 shop_propose 一条 business_intent，参数必须完整。",
    "4. 不要提议 order.refund 这类履约主干，除非 goal 明确要求售后。",
    "5. 提议后用简短中文说明理由，然后结束。",
  ].join("\n");
}

export function dispatchObserveTool(
  tools: ObserveHandle,
  name: string,
  params: Record<string, unknown>,
): unknown {
  switch (name) {
    case "shop_catalog":
      return tools.catalog();
    case "shop_playbooks":
      return tools.playbooks();
    case "shop_profile":
      return tools.profile();
    case "shop_query": {
      const capability = String(params.capability ?? "");
      const args = (params.args as Args | undefined) ?? {};
      return tools.query(capability, args);
    }
    case "shop_compose_ui":
      return tools.composeUi();
    case "shop_compose_report":
      return tools.composeReport(
        typeof params.summary === "string" ? { summary: params.summary } : {},
      );
    case "shop_propose":
      return tools.propose(
        String(params.capability ?? ""),
        (params.args as Args | undefined) ?? {},
        String(params.reason ?? ""),
      );
    default:
      throw new Error(`未知观察工具: ${name}`);
  }
}
