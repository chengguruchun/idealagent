import assert from "node:assert/strict";
import { test } from "node:test";

import { seedCommerce } from "../src/platform/backend/in-memory.js";
import { Platform } from "../src/platform/platform.js";
import { dispatchObserveTool, observeSystemPrompt } from "../src/platform/runtime/observe-bridge.js";

const TENANT = "shop-pi-test";

function observeHandle() {
  const platform = new Platform({ backend: seedCommerce(TENANT) });
  platform.tenants.seed({
    tenantId: TENANT,
    memory: [],
    uiPrefs: { home: "aftersale", tone: "concise" },
    merchandisingStrategy: { focus: "repurchase", notes: "复购" },
    marketingStrategy: { channel: "coupon", notes: "券" },
    reportPrefs: { highlight: "gmv" },
  });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "test",
    scope: ["catalog.*", "crm.*", "channel.*"],
    constraints: {},
  });
  const task = platform.tasks.admit({
    taskId: "obs",
    tenantId: TENANT,
    goal: "观察",
    grantId: grant.grantId,
    runtimeClass: "observe",
    successCriteria: [],
  });
  return { platform, task, tools: platform.observeFor(task) };
}

test("Pi 观察工具只能 query / propose，写 Playbook 会被墙", () => {
  const { tools } = observeHandle();
  const queried = dispatchObserveTool(tools, "shop_query", { capability: "catalog.list" }) as {
    status: string;
  };
  assert.equal(queried.status, "ok");

  const blocked = dispatchObserveTool(tools, "shop_query", {
    capability: "marketing.createCoupon",
    args: { couponId: "x", value: 1 },
  }) as { status: string; code?: string };
  assert.equal(blocked.status, "denied");
  assert.equal(blocked.code, "observe_cannot_write");

  const proposed = dispatchObserveTool(tools, "shop_propose", {
    capability: "marketing.createCoupon",
    args: { couponId: "x", value: 10 },
    reason: "复购券",
  }) as { capability: string };
  assert.equal(proposed.capability, "marketing.createCoupon");
});

test("观察目录与 Playbook 目录分开", () => {
  const { tools, task } = observeHandle();
  const catalog = tools.catalog();
  const playbooks = tools.playbooks();
  assert.ok(catalog.every((item) => item.kind === "query"));
  assert.ok(playbooks.every((item) => item.kind === "business_intent"));
  assert.ok(playbooks.some((item) => item.name === "marketing.createCoupon"));
  assert.match(observeSystemPrompt(task), /runtimeClass=observe/);
});
