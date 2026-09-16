import assert from "node:assert/strict";
import { test } from "node:test";

import { seedCommerce } from "../src/platform/backend/in-memory.js";
import { Saga } from "../src/platform/gateway/saga.js";
import { Platform } from "../src/platform/platform.js";
import { orderRefundedAtLeast, productPriceIs } from "../src/platform/task/checks.js";

const TENANT = "t1";

function setup(scope = ["order.*"], constraints = {}) {
  const backend = seedCommerce(TENANT);
  const platform = new Platform({ backend });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "test",
    scope,
    constraints: { amount: { currency: "CNY", perCall: 1000, total: 1000 }, ...constraints },
  });
  const task = platform.tasks.admit({
    taskId: "task",
    tenantId: TENANT,
    goal: "test",
    grantId: grant.grantId,
    successCriteria: [],
    maxSteps: 20,
  });
  return { backend, platform, grant, task };
}

test("写能力缺少幂等键直接拒绝", () => {
  const { platform, task } = setup();
  const result = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 10 });
  assert.equal(result.status, "denied");
  assert.equal(result.code, "idempotency_key_required");
});

test("幂等重放不重复执行也不重复扣额度", () => {
  const { backend, platform, grant, task } = setup();
  const args = { orderId: "ord_1001", amount: 40 };
  const first = platform.tasks.call(task, "order.refund", args, { idempotencyKey: "k" });
  const second = platform.tasks.call(task, "order.refund", args, { idempotencyKey: "k" });

  assert.equal(first.status, "ok");
  assert.equal(second.status, "replayed");
  assert.equal(backend.getOrder(TENANT, "ord_1001")?.refundedAmount, 40);
  assert.equal(platform.gateway.budget.usage(grant.grantId).amount, 40);
});

test("作用域之外的能力调不动", () => {
  const { platform, task } = setup(["order.*"]);
  const result = platform.tasks.call(task, "catalog.updatePrice", { productId: "prd_1", price: 1 }, {
    idempotencyKey: "k",
  });
  assert.equal(result.status, "denied");
  assert.equal(result.code, "scope");
});

test("未知过滤器按失败关闭处理", () => {
  const { platform, task } = setup(["order.*"], { filters: { "order.unknownFilter": 1 } });
  const result = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 10 }, {
    idempotencyKey: "k",
  });
  assert.equal(result.status, "denied");
  assert.equal(result.code, "filter");
});

test("升级规则拦截，审批后一次性放行", () => {
  const backend = seedCommerce(TENANT);
  const platform = new Platform({ backend });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "test",
    scope: ["order.*"],
    constraints: { amount: { currency: "CNY", perCall: 1000, total: 1000 } },
    escalate: ["amount > 50"],
  });
  const task = platform.tasks.admit({
    taskId: "task",
    tenantId: TENANT,
    goal: "test",
    grantId: grant.grantId,
    successCriteria: [orderRefundedAtLeast("ord_1001", 80)],
  });

  const blocked = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 80 }, {
    idempotencyKey: "k",
  });
  assert.equal(blocked.status, "requires_approval");
  assert.equal(task.status.phase, "AwaitingApproval");

  const approvalId = platform.tasks.approve(task, "merchant");
  assert.ok(approvalId);

  const allowed = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 80 }, {
    idempotencyKey: "k",
    approvalRef: approvalId,
  });
  assert.equal(allowed.status, "ok");

  platform.tasks.settle(task);
  assert.equal(task.status.phase, "Succeeded");
  assert.equal(task.status.outcome.complete, true);

  const reused = platform.gateway.getApproval(approvalId);
  assert.equal(reused?.status, "consumed");
});

test("成功判据只认外部状态，不认调用记录", () => {
  const { platform, task } = setup();
  task.spec.successCriteria = [orderRefundedAtLeast("ord_1001", 80)];

  task.status.calls.push({
    callId: "fake",
    capability: "order.refund",
    status: "ok",
    evidenceRef: "ledger:fake",
  });

  platform.tasks.settle(task);
  assert.equal(task.status.outcome.complete, false);
  assert.match(task.status.outcome.unmet[0], /已退 0/);
});

test("可逆能力按执行时快照补偿回旧值", () => {
  const { backend, platform, task } = setup(["catalog.*"]);
  const saga = new Saga("s1");

  platform.tasks.call(task, "catalog.updatePrice", { productId: "prd_1", price: 149 }, {
    idempotencyKey: "k",
    saga,
  });
  assert.equal(backend.getProduct(TENANT, "prd_1")?.price, 149);

  platform.rollback(task, saga);
  assert.equal(backend.getProduct(TENANT, "prd_1")?.price, 199);

  task.spec.successCriteria = [productPriceIs("prd_1", 199)];
  platform.tasks.settle(task);
  assert.equal(task.status.outcome.complete, true);
});

test("观察车道不能直接执行写 Playbook", () => {
  const { platform } = setup(["order.*", "catalog.*"]);
  const observe = platform.tasks.admit({
    taskId: "obs",
    tenantId: TENANT,
    goal: "观察",
    grantId: platform.grants.listForTenant(TENANT)[0].grantId,
    runtimeClass: "observe",
    successCriteria: [],
  });
  const blocked = platform.tasks.call(observe, "order.refund", { orderId: "ord_1001", amount: 10 }, {
    idempotencyKey: "k",
  });
  assert.equal(blocked.status, "denied");
  assert.equal(blocked.code, "observe_cannot_write");
});

test("两店同一套经营环，UI 和提议不同", async () => {
  const a = new Platform({ backend: seedCommerce("shop-a") });
  a.tenants.seed({
    tenantId: "shop-a",
    memory: [],
    uiPrefs: { home: "aftersale", tone: "concise" },
    merchandisingStrategy: { focus: "repurchase", notes: "复购" },
    marketingStrategy: { channel: "coupon", notes: "券" },
    reportPrefs: { highlight: "refund" },
  });
  const b = new Platform({ backend: seedCommerce("shop-b") });
  b.tenants.seed({
    tenantId: "shop-b",
    memory: [],
    uiPrefs: { home: "live", tone: "detailed" },
    merchandisingStrategy: { focus: "trend", notes: "趋势" },
    marketingStrategy: { channel: "xiaohongshu", notes: "内容" },
    reportPrefs: { highlight: "roi" },
  });

  const run = async (app: Platform, tenantId: string) => {
    const observeGrant = app.issueGrant({
      tenantId,
      agent: "op",
      scope: ["catalog.*", "crm.*", "channel.*"],
      constraints: {},
    });
    const playGrant = app.issueGrant({
      tenantId,
      agent: "op",
      scope: ["marketing.*", "catalog.*"],
      constraints: { amount: { currency: "CNY", perCall: 200, total: 500 } },
    });
    return app.operate({ tenantId, observeGrantId: observeGrant.grantId, playbookGrantId: playGrant.grantId });
  };

  const left = await run(a, "shop-a");
  const right = await run(b, "shop-b");

  assert.equal(left.ui.home, "aftersale");
  assert.equal(right.ui.home, "live");
  assert.equal(left.report.highlight, "refund");
  assert.equal(right.report.highlight, "roi");
  assert.equal(left.observe.status.proposals[0]?.capability, "marketing.createCoupon");
  assert.equal(right.observe.status.proposals[0]?.capability, "catalog.updatePrice");
  assert.equal(left.observe.spec.runtimeClass, "observe");
  assert.equal(left.playbook?.spec.runtimeClass, "playbook");
});

test("粗粒度退款是原子的：失败不留半个事务", () => {
  const { backend, platform, task } = setup();
  const before = structuredClone(backend.getOrder(TENANT, "ord_1001"));

  const result = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 999 }, {
    idempotencyKey: "k",
  });

  assert.equal(result.status, "precondition_failed");
  assert.equal(result.suggest, "order.query");
  assert.deepEqual(backend.getOrder(TENANT, "ord_1001"), before);
  assert.equal(backend.getCoupon(TENANT, "cpn_1")?.status, "used");
});
