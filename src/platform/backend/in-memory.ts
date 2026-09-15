import type {
  CommerceBackend,
  Coupon,
  LedgerEntry,
  Notification,
  Order,
  OrderStatus,
  Product,
  Ticket,
  TicketStatus,
} from "./types.js";

interface State {
  orders: Record<string, Order>;
  coupons: Record<string, Coupon>;
  inventory: Record<string, number>;
  ledger: LedgerEntry[];
  notifications: Notification[];
  tickets: Record<string, Ticket>;
  products: Record<string, Product>;
  seq: number;
}

const key = (tenantId: string, id: string) => `${tenantId}/${id}`;

export class InMemoryCommerce implements CommerceBackend {
  private state: State;

  constructor(seed?: Partial<State>) {
    this.state = {
      orders: {},
      coupons: {},
      inventory: {},
      ledger: [],
      notifications: [],
      tickets: {},
      products: {},
      seq: 0,
      ...seed,
    };
  }

  transaction<T>(fn: () => T): T {
    const snapshot = structuredClone(this.state);
    try {
      return fn();
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  getOrder(tenantId: string, orderId: string): Order | undefined {
    return this.state.orders[key(tenantId, orderId)];
  }

  listOrders(tenantId: string): Order[] {
    return Object.values(this.state.orders).filter((item) => item.tenantId === tenantId);
  }

  applyRefundToOrder(tenantId: string, orderId: string, amount: number): void {
    const order = this.require(this.getOrder(tenantId, orderId), `订单不存在: ${orderId}`);
    order.refundedAmount = round(order.refundedAmount + amount);
  }

  setOrderStatus(tenantId: string, orderId: string, status: OrderStatus): void {
    const order = this.require(this.getOrder(tenantId, orderId), `订单不存在: ${orderId}`);
    order.status = status;
  }

  getCoupon(tenantId: string, couponId: string): Coupon | undefined {
    return this.state.coupons[key(tenantId, couponId)];
  }

  reclaimCoupon(tenantId: string, couponId: string): void {
    const coupon = this.require(this.getCoupon(tenantId, couponId), `优惠券不存在: ${couponId}`);
    coupon.status = "reclaimed";
  }

  getInventory(tenantId: string, skuId: string): number {
    return this.state.inventory[key(tenantId, skuId)] ?? 0;
  }

  restoreInventory(tenantId: string, skuId: string, qty: number): void {
    this.state.inventory[key(tenantId, skuId)] = this.getInventory(tenantId, skuId) + qty;
  }

  postLedger(entry: Omit<LedgerEntry, "entryId" | "at">): LedgerEntry {
    this.state.seq += 1;
    const full: LedgerEntry = {
      ...entry,
      entryId: `led_${this.state.seq}`,
      at: new Date().toISOString(),
    };
    this.state.ledger.push(full);
    return full;
  }

  listLedger(tenantId: string, orderId: string): LedgerEntry[] {
    return this.state.ledger.filter(
      (item) => item.tenantId === tenantId && item.orderId === orderId,
    );
  }

  notifyBuyer(tenantId: string, buyerId: string, template: string): void {
    this.state.notifications.push({
      tenantId,
      buyerId,
      template,
      at: new Date().toISOString(),
    });
  }

  listNotifications(tenantId: string): Notification[] {
    return this.state.notifications.filter((item) => item.tenantId === tenantId);
  }

  getTicket(tenantId: string, ticketId: string): Ticket | undefined {
    return this.state.tickets[key(tenantId, ticketId)];
  }

  appendTicketReply(tenantId: string, ticketId: string, body: string): void {
    const ticket = this.require(this.getTicket(tenantId, ticketId), `工单不存在: ${ticketId}`);
    ticket.replies.push({ body, at: new Date().toISOString() });
  }

  setTicketStatus(tenantId: string, ticketId: string, status: TicketStatus): void {
    const ticket = this.require(this.getTicket(tenantId, ticketId), `工单不存在: ${ticketId}`);
    ticket.status = status;
  }

  getProduct(tenantId: string, productId: string): Product | undefined {
    return this.state.products[key(tenantId, productId)];
  }

  setProductPrice(tenantId: string, productId: string, price: number): void {
    const product = this.require(this.getProduct(tenantId, productId), `商品不存在: ${productId}`);
    product.price = price;
  }

  private require<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
  }
}

export function seedCommerce(tenantId: string): InMemoryCommerce {
  const orders: Record<string, Order> = {};
  const coupons: Record<string, Coupon> = {};
  const inventory: Record<string, number> = {};
  const tickets: Record<string, Ticket> = {};
  const products: Record<string, Product> = {};

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  orders[`${tenantId}/ord_1001`] = {
    orderId: "ord_1001",
    tenantId,
    buyerId: "buyer_a",
    paidAmount: 80,
    refundedAmount: 0,
    status: "completed",
    createdAt: daysAgo(3),
    couponId: "cpn_1",
    items: [{ skuId: "sku_red", qty: 1, price: 80 }],
  };

  orders[`${tenantId}/ord_1002`] = {
    orderId: "ord_1002",
    tenantId,
    buyerId: "buyer_b",
    paidAmount: 640,
    refundedAmount: 0,
    status: "shipped",
    createdAt: daysAgo(5),
    items: [{ skuId: "sku_blue", qty: 2, price: 320 }],
  };

  orders[`${tenantId}/ord_0900`] = {
    orderId: "ord_0900",
    tenantId,
    buyerId: "buyer_c",
    paidAmount: 50,
    refundedAmount: 0,
    status: "completed",
    createdAt: daysAgo(120),
    items: [{ skuId: "sku_red", qty: 1, price: 50 }],
  };

  coupons[`${tenantId}/cpn_1`] = { couponId: "cpn_1", tenantId, value: 20, status: "used" };
  inventory[`${tenantId}/sku_red`] = 4;
  inventory[`${tenantId}/sku_blue`] = 0;

  tickets[`${tenantId}/tkt_1`] = {
    ticketId: "tkt_1",
    tenantId,
    buyerId: "buyer_a",
    status: "open",
    replies: [],
  };

  products[`${tenantId}/prd_1`] = { productId: "prd_1", tenantId, price: 199 };

  return new InMemoryCommerce({ orders, coupons, inventory, tickets, products });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
