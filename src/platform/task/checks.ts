import type { OutcomeCheck } from "./types.js";

/**
 * 成功判据库。每一条都只查外部状态，
 * 不看 agent 的调用返回值，也不看它自己写的总结。
 */

export function orderRefundedAtLeast(orderId: string, amount: number): OutcomeCheck {
  return {
    id: `order_refunded_${orderId}`,
    describe: `订单 ${orderId} 的已退金额 ≥ ${amount}`,
    verify(backend, tenantId) {
      const order = backend.getOrder(tenantId, orderId);
      if (!order) return { ok: false, detail: `订单不存在: ${orderId}` };
      return order.refundedAmount >= amount
        ? { ok: true, detail: `已退 ${order.refundedAmount}`, evidenceRef: `order:${orderId}` }
        : { ok: false, detail: `已退 ${order.refundedAmount}，未达 ${amount}` };
    },
  };
}

export function ledgerHasRefund(orderId: string, amount: number): OutcomeCheck {
  return {
    id: `ledger_refund_${orderId}`,
    describe: `账务上存在订单 ${orderId} 金额 ${amount} 的退款分录`,
    verify(backend, tenantId) {
      const entries = backend.listLedger(tenantId, orderId);
      const hit = entries.find((item) => item.type === "refund" && item.amount === amount);
      return hit
        ? { ok: true, detail: `分录 ${hit.entryId}`, evidenceRef: `ledger:${hit.entryId}` }
        : { ok: false, detail: `未找到金额 ${amount} 的退款分录` };
    },
  };
}

export function couponReclaimed(couponId: string): OutcomeCheck {
  return {
    id: `coupon_reclaimed_${couponId}`,
    describe: `优惠券 ${couponId} 已回收`,
    verify(backend, tenantId) {
      const coupon = backend.getCoupon(tenantId, couponId);
      if (!coupon) return { ok: false, detail: `优惠券不存在: ${couponId}` };
      return coupon.status === "reclaimed"
        ? { ok: true, detail: "已回收", evidenceRef: `coupon:${couponId}` }
        : { ok: false, detail: `状态仍为 ${coupon.status}` };
    },
  };
}

export function ticketClosed(ticketId: string): OutcomeCheck {
  return {
    id: `ticket_closed_${ticketId}`,
    describe: `工单 ${ticketId} 已回复并关闭`,
    verify(backend, tenantId) {
      const ticket = backend.getTicket(tenantId, ticketId);
      if (!ticket) return { ok: false, detail: `工单不存在: ${ticketId}` };
      if (ticket.replies.length === 0) return { ok: false, detail: "尚无回复" };
      return ticket.status === "closed"
        ? { ok: true, detail: `${ticket.replies.length} 条回复且已关闭`, evidenceRef: `ticket:${ticketId}` }
        : { ok: false, detail: `状态为 ${ticket.status}` };
    },
  };
}

export function productPriceIs(productId: string, price: number): OutcomeCheck {
  return {
    id: `price_${productId}`,
    describe: `商品 ${productId} 售价为 ${price}`,
    verify(backend, tenantId) {
      const product = backend.getProduct(tenantId, productId);
      if (!product) return { ok: false, detail: `商品不存在: ${productId}` };
      return product.price === price
        ? { ok: true, detail: `当前 ${product.price}`, evidenceRef: `product:${productId}` }
        : { ok: false, detail: `当前 ${product.price}，期望 ${price}` };
    },
  };
}
