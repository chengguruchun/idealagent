import { CapabilityRegistry } from "../registry.js";
import { catalogUpdatePrice } from "./catalog.js";
import { orderQuery, orderRefund } from "./order.js";
import { supportReply } from "./support.js";

/**
 * 八个业务域是工具目录的命名空间，不是打分员。
 * 这里只落了三个域，其余域按同样形状补齐即可。
 */
export function defaultRegistry(): CapabilityRegistry {
  return new CapabilityRegistry().register(
    orderQuery,
    orderRefund,
    supportReply,
    catalogUpdatePrice,
  );
}

export { catalogUpdatePrice, orderQuery, orderRefund, supportReply };
