import { seedCommerce } from "./backend/in-memory.js";
import { Saga } from "./gateway/saga.js";
import { Platform } from "./platform.js";
import { functionRuntime, scriptedRuntime } from "./runtime/scripted.js";
import type { TenantProfile } from "./tenant/profile.js";
import {
  couponReclaimed,
  ledgerHasRefund,
  orderRefundedAtLeast,
  productPriceIs,
  ticketClosed,
} from "./task/checks.js";
import type { AgentTask } from "./task/types.js";

const TENANT = "youzan-shop-1";

async function main(): Promise<void> {
  await happyPath();
  await dryRun();
  await approvalLoop();
  await grantBoundary();
  await budgetExhausted();
  await idempotentReplay();
  await compensation();
  await operateTwoShops();
}

async function happyPath(): Promise<void> {
  section("1. 正常路径：一次退款走到 Succeeded");
  const platform = new Platform({ backend: seedCommerce(TENANT) });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    taskId: "task_001",
    scope: ["order.*"],
    constraints: {
      amount: { currency: "CNY", perCall: 200, total: 500 },
      count: { total: 20 },
      filters: { "order.createdWithinDays": 30 },
      ttlMinutes: 120,
    },
    escalate: ["amount > 100"],
  });

  const task = await platform.runTask({
    taskId: "task_001",
    tenantId: TENANT,
    goal: "为 ord_1001 办理全额退款",
    grantId: grant.grantId,
    successCriteria: [
      orderRefundedAtLeast("ord_1001", 80),
      ledgerHasRefund("ord_1001", 80),
      couponReclaimed("cpn_1"),
    ],
    runtime: scriptedRuntime([
      { capability: "order.query", args: { orderId: "ord_1001" } },
      {
        capability: "order.refund",
        args: { orderId: "ord_1001", amount: 80, reason: "尺码不合适" },
        options: { idempotencyKey: "task_001:refund" },
      },
    ]),
  });

  printTask(task);
  console.log(
    "  一次 order.refund 内部编排了 6 次存量服务调用：退款、回收券、回补库存、记账、通知、改状态",
  );
}

async function dryRun(): Promise<void> {
  section("2. dry-run：问'如果我这么做会发生什么'，不产生副作用");
  const backend = seedCommerce(TENANT);
  const platform = new Platform({ backend });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    scope: ["order.*"],
    constraints: { amount: { currency: "CNY", perCall: 800 } },
  });

  const task = platform.tasks.admit({
    taskId: "task_002",
    tenantId: TENANT,
    goal: "评估 ord_1002 退款影响",
    grantId: grant.grantId,
    successCriteria: [],
  });
  const result = platform.tasks.call(task, "order.refund", { orderId: "ord_1002", amount: 640 }, {
    dryRun: true,
  });

  for (const line of result.preview ?? []) console.log(`  · ${line}`);
  console.log(`  实际已退金额仍为 ${backend.getOrder(TENANT, "ord_1002")?.refundedAmount}`);
}

async function approvalLoop(): Promise<void> {
  section("3. 升级审批：超出授权自动边界 → 商家确认 → 继续执行");
  const platform = new Platform({ backend: seedCommerce(TENANT) });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    taskId: "task_003",
    scope: ["order.*"],
    constraints: {
      amount: { currency: "CNY", perCall: 800, total: 1000 },
      filters: { "order.createdWithinDays": 30 },
    },
    escalate: ["amount > 100"],
  });

  const criteria = [orderRefundedAtLeast("ord_1002", 640), ledgerHasRefund("ord_1002", 640)];
  let task = await platform.runTask({
    taskId: "task_003",
    tenantId: TENANT,
    goal: "为 ord_1002 办理退款 640",
    grantId: grant.grantId,
    successCriteria: criteria,
    runtime: scriptedRuntime([
      {
        capability: "order.refund",
        args: { orderId: "ord_1002", amount: 640 },
        options: { idempotencyKey: "task_003:refund" },
      },
    ]),
  });
  printTask(task, "  审批前");

  const approvalId = platform.tasks.approve(task, "merchant:王老板");
  console.log(`  商家批准了 ${approvalId}`);

  task = await platform.resumeTask(
    task,
    functionRuntime("resume", (current, tools) => {
      tools.call(
        "order.refund",
        { orderId: "ord_1002", amount: 640 },
        { idempotencyKey: "task_003:refund", approvalRef: approvalId },
      );
      void current;
    }),
  );
  printTask(task, "  审批后");
}

async function grantBoundary(): Promise<void> {
  section("4. 授权边界：作用域、时间过滤器、前置条件");
  const platform = new Platform({ backend: seedCommerce(TENANT) });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    scope: ["order.*"],
    constraints: {
      amount: { currency: "CNY", perCall: 200 },
      filters: { "order.createdWithinDays": 30 },
    },
  });
  const task = platform.tasks.admit({
    taskId: "task_004",
    tenantId: TENANT,
    goal: "试探授权边界",
    grantId: grant.grantId,
    successCriteria: [],
    maxSteps: 10,
  });

  const attempts: Array<[string, Record<string, unknown>]> = [
    ["catalog.updatePrice", { productId: "prd_1", price: 149 }],
    ["order.refund", { orderId: "ord_0900", amount: 50 }],
    ["order.refund", { orderId: "ord_1001", amount: 500 }],
    ["order.refund", { orderId: "ord_1001", amount: 50 }],
  ];

  for (const [capability, args] of attempts) {
    const result = platform.tasks.call(task, capability, args, {
      idempotencyKey: `task_004:${capability}:${JSON.stringify(args)}`,
    });
    console.log(
      `  ${capability.padEnd(20)} ${result.status.padEnd(20)} ${result.code ?? ""} ${result.reason ?? ""}`,
    );
    if (result.suggest) console.log(`  ${"".padEnd(20)} 建议改用 ${result.suggest}`);
  }
}

async function budgetExhausted(): Promise<void> {
  section("5. 预算在服务端强制：agent 循环也刷不穿");
  const platform = new Platform({ backend: seedCommerce(TENANT) });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    scope: ["order.*"],
    constraints: { amount: { currency: "CNY", perCall: 100, total: 100 }, count: { total: 5 } },
  });
  const task = platform.tasks.admit({
    taskId: "task_005",
    tenantId: TENANT,
    goal: "连续退款直到额度耗尽",
    grantId: grant.grantId,
    successCriteria: [],
  });

  for (const amount of [60, 20, 30]) {
    const result = platform.tasks.call(
      task,
      "order.refund",
      { orderId: "ord_1002", amount },
      { idempotencyKey: `task_005:${amount}` },
    );
    const usage = platform.gateway.budget.usage(grant.grantId);
    console.log(
      `  退 ${String(amount).padStart(3)} → ${result.status.padEnd(8)} ${result.reason ?? ""} · 已用 ${usage.amount}/100`,
    );
  }
}

async function idempotentReplay(): Promise<void> {
  section("6. 幂等重放：agent 重试不会退两次钱");
  const backend = seedCommerce(TENANT);
  const platform = new Platform({ backend });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    scope: ["order.*"],
    constraints: { amount: { currency: "CNY", perCall: 200, total: 500 } },
  });
  const task = platform.tasks.admit({
    taskId: "task_006",
    tenantId: TENANT,
    goal: "重复提交同一笔退款",
    grantId: grant.grantId,
    successCriteria: [orderRefundedAtLeast("ord_1001", 80)],
  });

  for (let i = 0; i < 2; i += 1) {
    const result = platform.tasks.call(
      task,
      "order.refund",
      { orderId: "ord_1001", amount: 80 },
      { idempotencyKey: "task_006:refund" },
    );
    console.log(
      `  第 ${i + 1} 次 → ${result.status.padEnd(9)} 已退 ${backend.getOrder(TENANT, "ord_1001")?.refundedAmount} · 额度已用 ${platform.gateway.budget.usage(grant.grantId).amount}`,
    );
  }

  const missingKey = platform.tasks.call(task, "order.refund", { orderId: "ord_1001", amount: 10 });
  console.log(`  不带幂等键 → ${missingKey.status} / ${missingKey.code}`);
}

async function compensation(): Promise<void> {
  section("7. 补偿回滚：可逆的撤回，不可逆的如实上报");
  const backend = seedCommerce(TENANT);
  const platform = new Platform({ backend });
  const grant = platform.issueGrant({
    tenantId: TENANT,
    agent: "ops-assistant",
    scope: ["catalog.*", "support.*", "order.*"],
    constraints: { amount: { currency: "CNY", perCall: 200, total: 500 } },
  });
  const saga = new Saga("saga_007");

  const task = await platform.runTask({
    taskId: "task_007",
    tenantId: TENANT,
    goal: "改价并回复工单",
    grantId: grant.grantId,
    successCriteria: [productPriceIs("prd_1", 149), ticketClosed("tkt_1")],
    saga,
    runtime: scriptedRuntime([
      {
        capability: "catalog.updatePrice",
        args: { productId: "prd_1", price: 149 },
        options: { idempotencyKey: "task_007:price" },
      },
      {
        capability: "order.refund",
        args: { orderId: "ord_1001", amount: 80 },
        options: { idempotencyKey: "task_007:refund" },
      },
      {
        capability: "support.reply",
        args: { ticketId: "tkt_1", body: "我们会全额赔付您的损失", close: true },
        options: { idempotencyKey: "task_007:reply" },
      },
    ]),
  });

  printTask(task, "  执行后");
  console.log(`  当前售价 ${backend.getProduct(TENANT, "prd_1")?.price}`);

  console.log("  发起回滚：");
  for (const result of platform.rollback(task, saga)) {
    console.log(`    ${result.capability.padEnd(20)} ${result.status.padEnd(8)} ${result.reason ?? ""}`);
  }
  console.log(`  回滚后售价 ${backend.getProduct(TENANT, "prd_1")?.price}`);
  console.log(`  账上退款分录仍在：${backend.listLedger(TENANT, "ord_1001").length} 条（钱退出去了，撤不回）`);
}

async function operateTwoShops(): Promise<void> {
  section("8. 经营环架子：同一套能力，两店 UI / 策略不同");
  const shops: TenantProfile[] = [
    {
      tenantId: "shop-repurchase",
      memory: [],
      uiPrefs: { home: "aftersale", tone: "concise" },
      merchandisingStrategy: { focus: "repurchase", notes: "老客复购为主" },
      marketingStrategy: { channel: "coupon", notes: "店内券，不投内容场" },
      reportPrefs: { highlight: "refund" },
    },
    {
      tenantId: "shop-trend",
      memory: [],
      uiPrefs: { home: "live", tone: "detailed" },
      merchandisingStrategy: { focus: "trend", notes: "跟小红书趋势上新" },
      marketingStrategy: { channel: "xiaohongshu", notes: "内容场带货" },
      reportPrefs: { highlight: "roi" },
    },
  ];

  for (const profile of shops) {
    const backend = seedCommerce(profile.tenantId);
    const app = new Platform({ backend });
    app.tenants.seed(profile);
    const observeGrant = app.issueGrant({
      tenantId: profile.tenantId,
      agent: "shop-operator",
      scope: ["catalog.*", "crm.*", "channel.*"],
      constraints: { ttlMinutes: 120 },
    });
    const playGrant = app.issueGrant({
      tenantId: profile.tenantId,
      agent: "shop-operator",
      scope: ["marketing.*", "catalog.*"],
      constraints: { amount: { currency: "CNY", perCall: 200, total: 500 } },
    });

    const result = await app.operate({
      tenantId: profile.tenantId,
      observeGrantId: observeGrant.grantId,
      playbookGrantId: playGrant.grantId,
    });

    console.log(`\n  [${profile.tenantId}] home=${result.ui.home} modules=${result.ui.modules.join("/")}`);
    console.log(`  报告: ${result.report.title}`);
    console.log(
      `  提议: ${result.observe.status.proposals.map((item) => `${item.capability} (${item.status})`).join(", ") || "无"}`,
    );
    console.log(`  券: ${backend.listCoupons(profile.tenantId).map((item) => item.couponId).join(", ")}`);
    console.log(`  prd_2 价格: ${backend.getProduct(profile.tenantId, "prd_2")?.price}`);
    console.log(`  memory: ${result.tenant.memory.at(-1)}`);
  }
}

function printTask(task: AgentTask, label = "  结果"): void {
  const conditions = task.status.conditions
    .map((item) => `${item.type}=${item.status}`)
    .join(" ");
  console.log(`${label}: phase=${task.status.phase} steps=${task.status.steps}`);
  console.log(`  ${conditions}`);
  console.log(`  outcome.complete=${task.status.outcome.complete} evidence=[${task.status.outcome.evidenceRefs.join(", ")}]`);
  if (task.status.outcome.unmet.length > 0) {
    console.log(`  未达成: ${task.status.outcome.unmet.join(" | ")}`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(64)}\n${title}\n${"=".repeat(64)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
