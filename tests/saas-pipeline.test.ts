import assert from "node:assert/strict";
import { test } from "node:test";

import { createSaasAgent } from "../src/saas/pipeline.ts";
import { planDimensions } from "../src/saas/specialists.ts";
import type { NormalizedEvent, SaaSEvent } from "../src/saas/types.ts";

function event(partial: Partial<SaaSEvent> & Pick<SaaSEvent, "eventId" | "kind">): SaaSEvent {
  return {
    tenantId: "t1",
    actor: { type: "buyer", id: "u1" },
    ...partial,
  };
}

test("FAQ inquiry uses fast auto path", async () => {
  const agent = createSaasAgent();
  const result = await agent.evaluate(
    event({ eventId: "faq", kind: "inquiry", payload: { faqHit: true }, intent: "几点发货" }),
  );
  assert.equal(result.route, "white");
  assert.equal(result.decision, "auto");
  assert.equal(result.latencyBudget, "fast_path");
  assert.equal(result.specialists, undefined);
});

test("policy block uses fast reject path", async () => {
  const agent = createSaasAgent();
  const result = await agent.evaluate(
    event({ eventId: "block", kind: "refund", payload: { policyBlock: true, amount: 10 } }),
  );
  assert.equal(result.route, "black");
  assert.equal(result.decision, "reject");
});

test("duplicate event is rejected by gateway", async () => {
  const agent = createSaasAgent();
  const payload = event({ eventId: "dup-1", kind: "inquiry" });
  await agent.evaluate(payload);
  const again = await agent.evaluate(payload);
  assert.equal(again.route, "duplicate");
  assert.equal(again.decision, "reject");
});

test("refund plans order/finance/risk/crm not geo specialists", () => {
  const planned = planDimensions({
    eventId: "g",
    tenantId: "t1",
    kind: "refund",
    occurredAt: "2026-09-15T10:00:00+08:00",
    actor: { type: "buyer", id: "u1" },
    payload: { amount: 6800, orderId: "o1", stock: 1 },
    labels: { firstPurchase: true },
    idempotencyKey: "t1:g",
  } satisfies NormalizedEvent);
  assert.ok(planned.includes("order"));
  assert.ok(planned.includes("finance"));
  assert.ok(planned.includes("risk"));
  assert.ok(planned.includes("crm"));
  assert.ok(planned.includes("catalog"));
  assert.ok(!planned.includes("geo_velocity" as never));
});

test("gray refund runs saas domain agents then fuses", async () => {
  const agent = createSaasAgent();
  const result = await agent.evaluate(
    event({
      eventId: "refund-gray",
      kind: "refund",
      payload: { amount: 6800, orderId: "o1", productId: "p1", stock: 1, refundReason: "7天无理由" },
      labels: { firstPurchase: true, newDevice: true },
    }),
  );
  assert.equal(result.route, "gray");
  assert.equal(result.latencyBudget, "agent_path");
  assert.ok(result.planned?.includes("order"));
  assert.ok(result.fusion);
  assert.ok(["confirm", "human", "reject"].includes(result.decision));
});

test("FAQ proxy and real outcome can both pass", async () => {
  const agent = createSaasAgent();
  const result = await agent.evaluate(
    event({ eventId: "faq-outcome", kind: "inquiry", payload: { faqHit: true }, intent: "几点发货" }),
  );
  const types = Object.fromEntries(result.task.status.conditions.map((item) => [item.type, item.status]));
  assert.equal(types.ProxyChecksPassed, "True");
  assert.equal(types.RealOutcomeVerified, "True");
  assert.equal(result.task.status.outcome.complete, true);
});

test("refund confirm is proxy-green but not a real outcome", async () => {
  const agent = createSaasAgent();
  const result = await agent.evaluate(
    event({
      eventId: "refund-outcome",
      kind: "refund",
      payload: { amount: 6800, orderId: "o1", refundReason: "7天无理由" },
      labels: { firstPurchase: true },
    }),
  );
  const types = Object.fromEntries(result.task.status.conditions.map((item) => [item.type, item.status]));
  assert.equal(types.ProxyChecksPassed, "True");
  assert.equal(types.RealOutcomeVerified, "False");
  assert.equal(result.task.status.outcome.complete, false);
  assert.equal(result.task.status.phase, "AwaitingApproval");
});
