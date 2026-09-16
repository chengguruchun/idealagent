export type OrderStatus = "paid" | "shipped" | "completed" | "closed";
export type CouponStatus = "active" | "used" | "reclaimed";
export type TicketStatus = "open" | "replied" | "closed";

export interface OrderItem {
  skuId: string;
  qty: number;
  price: number;
}

export interface Order {
  orderId: string;
  tenantId: string;
  buyerId: string;
  paidAmount: number;
  refundedAmount: number;
  status: OrderStatus;
  createdAt: string;
  couponId?: string;
  crossStoreGroupId?: string;
  items: OrderItem[];
}

export interface Coupon {
  couponId: string;
  tenantId: string;
  value: number;
  status: CouponStatus;
}

export interface LedgerEntry {
  entryId: string;
  tenantId: string;
  orderId: string;
  type: "refund" | "charge";
  amount: number;
  period: string;
  at: string;
}

export interface Notification {
  tenantId: string;
  buyerId: string;
  template: string;
  at: string;
}

export interface TicketReply {
  body: string;
  at: string;
}

export interface Ticket {
  ticketId: string;
  tenantId: string;
  buyerId: string;
  status: TicketStatus;
  replies: TicketReply[];
}

export interface Product {
  productId: string;
  tenantId: string;
  title: string;
  price: number;
  tags: string[];
}

/**
 * 细粒度的存量能力，一个方法对应一次真实微服务调用。
 * Agent 永远不直接触碰这一层，只有 L1 的能力契约可以编排它。
 *
 * transaction 在内存实现里靠快照回滚；接真实服务时这里换成 saga 协调器，
 * 由各方法声明的补偿动作逐步回退。接口形状保持不变。
 */
export interface CommerceBackend {
  transaction<T>(fn: () => T): T;

  getOrder(tenantId: string, orderId: string): Order | undefined;
  listOrders(tenantId: string): Order[];
  applyRefundToOrder(tenantId: string, orderId: string, amount: number): void;
  setOrderStatus(tenantId: string, orderId: string, status: OrderStatus): void;

  getCoupon(tenantId: string, couponId: string): Coupon | undefined;
  listCoupons(tenantId: string): Coupon[];
  createCoupon(tenantId: string, couponId: string, value: number): Coupon;
  reclaimCoupon(tenantId: string, couponId: string): void;

  getInventory(tenantId: string, skuId: string): number;
  restoreInventory(tenantId: string, skuId: string, qty: number): void;

  postLedger(entry: Omit<LedgerEntry, "entryId" | "at">): LedgerEntry;
  listLedger(tenantId: string, orderId: string): LedgerEntry[];

  notifyBuyer(tenantId: string, buyerId: string, template: string): void;
  listNotifications(tenantId: string): Notification[];

  getTicket(tenantId: string, ticketId: string): Ticket | undefined;
  appendTicketReply(tenantId: string, ticketId: string, body: string): void;
  setTicketStatus(tenantId: string, ticketId: string, status: TicketStatus): void;

  getProduct(tenantId: string, productId: string): Product | undefined;
  listProducts(tenantId: string): Product[];
  setProductPrice(tenantId: string, productId: string, price: number): void;
}
