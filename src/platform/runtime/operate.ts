import type { ObserveHandle, ObserveRuntime } from "./types.js";

/**
 * 默认经营观察循环：读趋势 / 商品 / 报告，按 TenantProfile 拼 UI，再提议一条写能力。
 * 真实模型接进来时替换这个 runtime，不要改网关。
 */
export function defaultOperateRuntime(): ObserveRuntime {
  return {
    name: "operate-observe",
    run(_task, tools: ObserveHandle) {
      const trends = tools.query("channel.trends");
      const talents = tools.query("channel.talents");
      const catalog = tools.query("catalog.list");
      const snapshot = tools.query("crm.report");
      tools.composeUi();
      tools.composeReport({
        summary: `gmv=${JSON.stringify(snapshot.data)} trends=${JSON.stringify(trends.data)}`,
      });

      const profile = tools.profile();
      const products = Array.isArray(catalog.data) ? catalog.data : [];
      const trendItem = products.find((item) => {
        const tags = (item as { tags?: string[] }).tags ?? [];
        return tags.includes("trend");
      }) as { productId?: string } | undefined;

      if (profile.marketingStrategy.channel === "coupon") {
        tools.propose(
          "marketing.createCoupon",
          { couponId: `cpn_${profile.tenantId}_week`, value: 15 },
          "老客复购：店内券",
        );
      } else if (profile.merchandisingStrategy.focus === "trend" && trendItem?.productId) {
        tools.propose(
          "catalog.updatePrice",
          { productId: trendItem.productId, price: 119 },
          `跟内容场趋势推 ${trendItem.productId}`,
        );
      }

      void talents;
    },
  };
}
