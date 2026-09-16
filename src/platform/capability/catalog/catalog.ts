import { defineCapability } from "../contract.js";

export const catalogList = defineCapability({
  name: "catalog.list",
  namespace: "catalog",
  intent: "读取本店商品列表，供选品与陈列决策",
  kind: "query",
  requiresScope: ["catalog.read"],
  effects: [],
  irreversible: false,
  idempotency: "not_applicable",
  pitfalls: [],
  preconditions: [],
  amountOf: () => 0,
  dryRun: () => ["读取商品目录"],
  execute(ctx) {
    const products = ctx.backend.listProducts(ctx.tenantId);
    return {
      data: products,
      changeSet: {},
      evidenceRef: `catalog:${ctx.tenantId}`,
    };
  },
});

type PriceArgs = {
  productId: string;
  price: number;
};

export const catalogUpdatePrice = defineCapability<PriceArgs>({
  name: "catalog.updatePrice",
  namespace: "catalog",
  intent: "调整商品售价",
  kind: "business_intent",
  requiresScope: ["catalog.write"],
  effects: [{ type: "content_change", reversible: true }],
  irreversible: false,
  idempotency: "required",
  pitfalls: ["进行中的活动会按新价重算，改价前先查 marketing 域的活动占用"],
  preconditions: [
    {
      id: "product_exists",
      describe: "商品存在",
      check: (ctx) =>
        ctx.backend.getProduct(ctx.tenantId, ctx.args.productId)
          ? null
          : `商品不存在: ${ctx.args.productId}`,
    },
    {
      id: "price_positive",
      describe: "价格为正",
      check: (ctx) => (ctx.args.price > 0 ? null : "价格必须大于 0"),
    },
  ],
  amountOf: () => 0,
  dryRun(ctx) {
    const product = ctx.backend.getProduct(ctx.tenantId, ctx.args.productId);
    return [`商品 ${ctx.args.productId} 价格 ${product?.price} → ${ctx.args.price}`];
  },
  execute(ctx) {
    const before = ctx.backend.getProduct(ctx.tenantId, ctx.args.productId);
    const previous = before?.price;
    ctx.backend.setProductPrice(ctx.tenantId, ctx.args.productId, ctx.args.price);
    return {
      data: { previous },
      changeSet: { product: ctx.args.productId, from: previous, to: ctx.args.price },
      evidenceRef: `product:${ctx.args.productId}`,
    };
  },
  compensationFor(ctx, output) {
    const previous = (output.data as { previous?: number } | undefined)?.previous;
    if (previous === undefined) return null;
    return {
      capability: "catalog.updatePrice",
      args: { productId: ctx.args.productId, price: previous },
    };
  },
});
