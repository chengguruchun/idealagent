import { CapabilityRegistry } from "../registry.js";
import { catalogList, catalogUpdatePrice } from "./catalog.js";
import { channelTalents, channelTrends } from "./channel.js";
import { crmReport } from "./crm.js";
import { marketingCreateCoupon } from "./marketing.js";
import { orderQuery, orderRefund } from "./order.js";
import { supportReply } from "./support.js";

/**
 * 八个业务域 + channel 是工具目录命名空间。
 * 新渠道只在这里 register，不要改 Control Plane。
 */
export function defaultRegistry(): CapabilityRegistry {
  return new CapabilityRegistry().register(
    orderQuery,
    orderRefund,
    catalogList,
    catalogUpdatePrice,
    supportReply,
    marketingCreateCoupon,
    crmReport,
    channelTrends,
    channelTalents,
  );
}

export {
  catalogList,
  catalogUpdatePrice,
  channelTalents,
  channelTrends,
  crmReport,
  marketingCreateCoupon,
  orderQuery,
  orderRefund,
  supportReply,
};
