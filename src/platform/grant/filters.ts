import type { CommerceBackend } from "../backend/types.js";
import type { Args } from "../capability/contract.js";

export interface FilterInput {
  tenantId: string;
  args: Args;
  backend: CommerceBackend;
  value: unknown;
}

/** 返回 null 表示通过，返回字符串表示拒绝原因。 */
export type FilterFn = (input: FilterInput) => string | null;

export const FILTERS: Record<string, FilterFn> = {
  "order.createdWithinDays": ({ tenantId, args, backend, value }) => {
    const orderId = typeof args.orderId === "string" ? args.orderId : undefined;
    if (!orderId) return null;
    const order = backend.getOrder(tenantId, orderId);
    if (!order) return null;
    const days = Number(value);
    const age = (Date.now() - Date.parse(order.createdAt)) / 86_400_000;
    return age <= days ? null : `订单已创建 ${Math.floor(age)} 天，超出授权限定的 ${days} 天`;
  },

  "order.statusIn": ({ tenantId, args, backend, value }) => {
    const orderId = typeof args.orderId === "string" ? args.orderId : undefined;
    if (!orderId) return null;
    const order = backend.getOrder(tenantId, orderId);
    if (!order) return null;
    const allowed = Array.isArray(value) ? value.map(String) : [];
    return allowed.includes(order.status)
      ? null
      : `订单状态 ${order.status} 不在授权允许的 ${allowed.join("/")} 内`;
  },
};

export function applyFilters(
  filters: Record<string, unknown> | undefined,
  input: Omit<FilterInput, "value">,
): string | null {
  if (!filters) return null;
  for (const [name, value] of Object.entries(filters)) {
    const fn = FILTERS[name];
    if (!fn) {
      return `授权含未知过滤器 ${name}，按失败关闭处理`;
    }
    const reason = fn({ ...input, value });
    if (reason) return reason;
  }
  return null;
}
