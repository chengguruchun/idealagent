import { defineCapability } from "../contract.js";

type ReplyArgs = {
  ticketId: string;
  body: string;
  close?: boolean;
};

export const supportReply = defineCapability<ReplyArgs>({
  name: "support.reply",
  namespace: "support",
  intent: "回复售后工单，可选择同时关单",
  kind: "business_intent",
  requiresScope: ["support.reply"],
  effects: [
    { type: "notify_buyer", reversible: false, note: "消息一旦发出无法撤回" },
    { type: "state_change", reversible: true },
  ],
  irreversible: true,
  idempotency: "required",
  pitfalls: ["回复中不要出现赔付承诺，赔付须走 finance 域能力并单独授权"],
  preconditions: [
    {
      id: "ticket_open",
      describe: "工单存在且未关闭",
      check: (ctx) => {
        const ticket = ctx.backend.getTicket(ctx.tenantId, ctx.args.ticketId);
        if (!ticket) return `工单不存在: ${ctx.args.ticketId}`;
        return ticket.status === "closed" ? "工单已关闭" : null;
      },
    },
    {
      id: "no_payout_promise",
      describe: "回复内容不含赔付承诺",
      check: (ctx) =>
        /赔付|包赔|全额赔/.test(ctx.args.body) ? "回复含赔付承诺，需人工处理" : null,
    },
  ],
  amountOf: () => 0,
  dryRun: (ctx) => [
    `向工单 ${ctx.args.ticketId} 追加回复（${ctx.args.body.length} 字）`,
    ctx.args.close ? "并关闭工单" : "保持工单开启",
  ],
  execute(ctx) {
    const { tenantId, args, backend } = ctx;
    return backend.transaction(() => {
      backend.appendTicketReply(tenantId, args.ticketId, args.body);
      backend.setTicketStatus(tenantId, args.ticketId, args.close ? "closed" : "replied");
      return {
        changeSet: { ticket: args.ticketId, closed: Boolean(args.close) },
        evidenceRef: `ticket:${args.ticketId}`,
      };
    });
  },
});
