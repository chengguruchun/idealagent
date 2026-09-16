import { defineCapability } from "../contract.js";

type CouponArgs = {
  couponId: string;
  value: number;
};

/**
 * 发券 Playbook 全站一份。推谁、推什么券值，由观察车道按租户策略提议。
 */
export const marketingCreateCoupon = defineCapability<CouponArgs>({
  name: "marketing.createCoupon",
  namespace: "marketing",
  intent: "创建店铺优惠券（核销与账务仍走平台标准路径）",
  kind: "business_intent",
  requiresScope: ["marketing.write"],
  effects: [{ type: "content_change", reversible: true }],
  irreversible: false,
  idempotency: "required",
  pitfalls: ["券值过大可能冲击毛利，应先看 crm.report 再提议"],
  preconditions: [
    {
      id: "value_positive",
      describe: "券值大于 0",
      check: (ctx) => (ctx.args.value > 0 ? null : "券值必须大于 0"),
    },
    {
      id: "id_free",
      describe: "券 ID 未被占用",
      check: (ctx) =>
        ctx.backend.getCoupon(ctx.tenantId, ctx.args.couponId)
          ? `优惠券已存在: ${ctx.args.couponId}`
          : null,
    },
  ],
  amountOf: (args) => args.value,
  dryRun: (ctx) => [`创建优惠券 ${ctx.args.couponId}，面值 ${ctx.args.value}`],
  execute(ctx) {
    const coupon = ctx.backend.createCoupon(ctx.tenantId, ctx.args.couponId, ctx.args.value);
    return {
      data: coupon,
      changeSet: { coupon: coupon.couponId, value: coupon.value },
      evidenceRef: `coupon:${coupon.couponId}`,
    };
  },
});
