import { defineCapability } from "../contract.js";

/** 客户 / 经营报告的只读快照。呈现怎么拼由 TenantProfile.reportPrefs 决定。 */
export const crmReport = defineCapability({
  name: "crm.report",
  namespace: "crm",
  intent: "读取经营快照：订单、商品、券",
  kind: "query",
  requiresScope: ["crm.read"],
  effects: [],
  irreversible: false,
  idempotency: "not_applicable",
  pitfalls: [],
  preconditions: [],
  amountOf: () => 0,
  dryRun: () => ["读取经营快照"],
  execute(ctx) {
    const orders = ctx.backend.listOrders(ctx.tenantId);
    const gmv = orders.reduce((sum, item) => sum + item.paidAmount - item.refundedAmount, 0);
    const refunded = orders.reduce((sum, item) => sum + item.refundedAmount, 0);
    return {
      data: {
        orderCount: orders.length,
        gmv,
        refunded,
        products: ctx.backend.listProducts(ctx.tenantId).length,
        coupons: ctx.backend.listCoupons(ctx.tenantId).length,
      },
      changeSet: {},
      evidenceRef: `report:${ctx.tenantId}`,
    };
  },
});
