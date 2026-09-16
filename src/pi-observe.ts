import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { createIdealAgent } from "./create-session.js";
import {
  dispatchObserveTool,
  OBSERVE_TOOL_NAMES,
  observeSystemPrompt,
} from "./platform/runtime/observe-bridge.js";
import type { ObserveHandle, ObserveRuntime } from "./platform/runtime/types.js";
import type { AgentTask } from "./platform/task/types.js";

export interface PiObserveOptions {
  cwd?: string;
  agentDir?: string;
  provider?: string;
  model?: string;
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    details: {},
  };
}

function observeTools(tools: ObserveHandle) {
  const argsObject = Type.Object({}, { additionalProperties: true });

  return [
    defineTool({
      name: "shop_catalog",
      label: "Shop catalog",
      description: "列出可查询的只读能力",
      parameters: Type.Object({}),
      execute: async () => textResult(dispatchObserveTool(tools, "shop_catalog", {})),
    }),
    defineTool({
      name: "shop_playbooks",
      label: "Shop playbooks",
      description: "列出可提议、但不能直接执行的写 Playbook",
      parameters: Type.Object({}),
      execute: async () => textResult(dispatchObserveTool(tools, "shop_playbooks", {})),
    }),
    defineTool({
      name: "shop_profile",
      label: "Shop profile",
      description: "读取本租户 UI / 选品 / 营销 / 报告偏好",
      parameters: Type.Object({}),
      execute: async () => textResult(dispatchObserveTool(tools, "shop_profile", {})),
    }),
    defineTool({
      name: "shop_query",
      label: "Shop query",
      description: "调用一条 query 能力。写能力会被网关拒绝。",
      parameters: Type.Object({
        capability: Type.String({ description: "如 catalog.list / crm.report / channel.trends" }),
        args: Type.Optional(argsObject),
      }),
      execute: async (_id, params) => textResult(dispatchObserveTool(tools, "shop_query", params)),
    }),
    defineTool({
      name: "shop_compose_ui",
      label: "Compose UI",
      description: "按 TenantProfile 拼本店首页模块",
      parameters: Type.Object({}),
      execute: async () => textResult(dispatchObserveTool(tools, "shop_compose_ui", {})),
    }),
    defineTool({
      name: "shop_compose_report",
      label: "Compose report",
      description: "按 TenantProfile 拼客户报告",
      parameters: Type.Object({
        summary: Type.Optional(Type.String()),
      }),
      execute: async (_id, params) =>
        textResult(dispatchObserveTool(tools, "shop_compose_report", params)),
    }),
    defineTool({
      name: "shop_propose",
      label: "Propose playbook",
      description: "提议一条写 Playbook，不会立刻执行",
      parameters: Type.Object({
        capability: Type.String({ description: "business_intent 名称，如 marketing.createCoupon" }),
        args: argsObject,
        reason: Type.String(),
      }),
      execute: async (_id, params) => textResult(dispatchObserveTool(tools, "shop_propose", params)),
    }),
  ];
}

/**
 * Pi 只作为观察车道。builtin 工具关掉，写路径仍由 fulfillProposals 跑。
 */
export function piObserveRuntime(options: PiObserveOptions = {}): ObserveRuntime {
  return {
    name: "pi-observe",
    async run(task: AgentTask, tools: ObserveHandle) {
      const { session } = await createIdealAgent({
        cwd: options.cwd,
        agentDir: options.agentDir,
        provider: options.provider,
        model: options.model,
        persist: false,
        noTools: "builtin",
        tools: [...OBSERVE_TOOL_NAMES],
        customTools: observeTools(tools),
        systemPrompt: (base) => `${observeSystemPrompt(task)}\n\n${base ?? ""}`,
      });

      try {
        await session.prompt(
          `${task.spec.goal}\n请先观察本店画像和数据，再最多提议一条可执行 Playbook。`,
        );
      } finally {
        session.dispose();
      }
    },
  };
}
