import { defineCapability, type CapabilityContext } from "../contract.js";

type RefundArgs = {
  orderId: string;
  amount: number;
  reason?: string;
};

type QueryArgs = {
  orderId: string;
};

const REFUNDABLE = new Set(["paid", "shipped", "completed"]);

export const orderQuery = defineCapability<QueryArgs>({
  name: "order.query",
  namespace: "order",
  intent: "读取订单详情与可退金额",
  kind: "query",
  requiresScope: ["order.read"],
  effects: [],
  irreversible: false,
  idempotency: "not_applicable",
  pitfalls: [],
  preconditions: [],
  amountOf: () => 0,
  dryRun: (ctx) => [`读取订单 ${ctx.args.orderId}`],
  execute(ctx) {
    const order = ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId);
    if (!order) throw new Error(`订单不存在: ${ctx.args.orderId}`);
    return {
      data: { ...order, refundable: round(order.paidAmount - order.refundedAmount) },
      changeSet: {},
      evidenceRef: `order:${order.orderId}`,
    };
  },
});

/**
 * 粗粒度到"一个商业意图"：调用方说"退这笔钱"，
 * 内部编排 6 个存量微服务调用并包在一个事务里。
 * 让 agent 自己按顺序调这 6 个，等于把一致性交给一个会犯错的概率模型。
 */
export const orderRefund = defineCapability<RefundArgs>({
  name: "order.refund",
  namespace: "order",
  intent: "对一笔订单退款，含优惠券回收、库存回补与账务冲抵",
  kind: "business_intent",
  requiresScope: ["order.refund"],
  effects: [
    { type: "money_out", reversible: false },
    { type: "coupon_reclaim", reversible: true },
    { type: "inventory_change", reversible: true },
    { type: "notify_buyer", reversible: false, note: "会给买家发短信，发出后撤不回" },
    { type: "state_change", reversible: true },
  ],
  irreversible: true,
  idempotency: "required",
  pitfalls: [
    "跨月退款会影响上月对账，财务侧需二次确认",
    "参与跨店满减的订单，必须连带处理同组其它订单，否则优惠分摊会算错",
  ],
  onPreconditionFail: { suggest: "order.query" },
  preconditions: [
    {
      id: "order_exists",
      describe: "订单存在且属于本租户",
      check: (ctx) =>
        ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId) ? null : `订单不存在: ${ctx.args.orderId}`,
    },
    {
      id: "status_refundable",
      describe: "订单状态 ∈ {已支付, 已发货, 已完成}",
      check: (ctx) => {
        const order = ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId);
        if (!order) return null;
        return REFUNDABLE.has(order.status) ? null : `订单状态 ${order.status} 不可退`;
      },
    },
    {
      id: "amount_within_paid",
      describe: "已退金额 + 本次金额 ≤ 实付金额",
      check: (ctx) => {
        const order = ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId);
        if (!order) return null;
        const after = order.refundedAmount + ctx.args.amount;
        return after <= order.paidAmount
          ? null
          : `超额退款: 已退 ${order.refundedAmount} + 本次 ${ctx.args.amount} > 实付 ${order.paidAmount}`;
      },
    },
    {
      id: "no_cross_store_group",
      describe: "非跨店满减订单（跨店需走专用能力）",
      check: (ctx) => {
        const order = ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId);
        if (!order?.crossStoreGroupId) return null;
        return `订单属于跨店满减组 ${order.crossStoreGroupId}，需走 order.refundCrossStore`;
      },
    },
  ],
  amountOf: (args) => args.amount,
  dryRun(ctx) {
    const order = ctx.backend.getOrder(ctx.tenantId, ctx.args.orderId);
    if (!order) return [`订单不存在: ${ctx.args.orderId}`];
    const steps = [
      `订单 ${order.orderId} 已退金额 ${order.refundedAmount} → ${round(order.refundedAmount + ctx.args.amount)}`,
    ];
    if (order.couponId) steps.push(`回收优惠券 ${order.couponId}`);
    for (const item of order.items) {
      steps.push(`回补库存 ${item.skuId} +${item.qty}`);
    }
    steps.push(`记一笔 ${period()} 退款账 ${ctx.args.amount}`);
    steps.push(`给买家 ${order.buyerId} 发退款通知`);
    if (round(order.refundedAmount + ctx.args.amount) >= order.paidAmount) {
      steps.push(`订单状态 ${order.status} → closed`);
    }
    return steps;
  },
  execute(ctx: CapabilityContext<RefundArgs>) {
    const { tenantId, args, backend } = ctx;
    return backend.transaction(() => {
      const order = backend.getOrder(tenantId, args.orderId);
      if (!order) throw new Error(`订单不存在: ${args.orderId}`);

      backend.applyRefundToOrder(tenantId, args.orderId, args.amount);

      if (order.couponId) {
        backend.reclaimCoupon(tenantId, order.couponId);
      }
      for (const item of order.items) {
        backend.restoreInventory(tenantId, item.skuId, item.qty);
      }

      const entry = backend.postLedger({
        tenantId,
        orderId: args.orderId,
        type: "refund",
        amount: args.amount,
        period: period(),
      });

      backend.notifyBuyer(tenantId, order.buyerId, "refund_done");

      const after = backend.getOrder(tenantId, args.orderId);
      if (after && after.refundedAmount >= after.paidAmount) {
        backend.setOrderStatus(tenantId, args.orderId, "closed");
      }

      return {
        data: { entryId: entry.entryId, refundedAmount: after?.refundedAmount },
        changeSet: {
          order: args.orderId,
          refunded: args.amount,
          coupon: order.couponId ?? null,
          ledger: entry.entryId,
        },
        evidenceRef: `ledger:${entry.entryId}`,
      };
    });
  },
});

function period(): string {
  return new Date().toISOString().slice(0, 7);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
