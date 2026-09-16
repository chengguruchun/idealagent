import { defineCapability } from "../contract.js";

/**
 * 内容场 / 达人只读入口。后面接小红书、达人平台时只换 execute，不换观察车道。
 * 投放创建应另做 business_intent，本架子先不开放写出网。
 */
export const channelTrends = defineCapability({
  name: "channel.trends",
  namespace: "channel",
  intent: "读取内容场趋势（架子数据，可替换为真实渠道）",
  kind: "query",
  requiresScope: ["channel.read"],
  effects: [],
  irreversible: false,
  idempotency: "not_applicable",
  pitfalls: ["趋势源有时效和虚假种草，不能直接当成选品结论"],
  preconditions: [],
  amountOf: () => 0,
  dryRun: () => ["读取内容场趋势"],
  execute() {
    return {
      data: [
        { topic: "早秋卫衣叠穿", source: "xiaohongshu", heat: 86 },
        { topic: "通勤小包", source: "xiaohongshu", heat: 71 },
        { topic: "直播间限时色", source: "live", heat: 64 },
      ],
      changeSet: {},
      evidenceRef: "channel:trends",
    };
  },
});

export const channelTalents = defineCapability({
  name: "channel.talents",
  namespace: "channel",
  intent: "读取达人候选（架子数据，可替换为真实达人平台）",
  kind: "query",
  requiresScope: ["channel.read"],
  effects: [],
  irreversible: false,
  idempotency: "not_applicable",
  pitfalls: ["粉丝数不等于成交，应用 crm.report 对照 ROI"],
  preconditions: [],
  amountOf: () => 0,
  dryRun: () => ["读取达人候选"],
  execute() {
    return {
      data: [
        { talentId: "kol_a", platform: "xiaohongshu", niche: "穿搭", followers: 120_000 },
        { talentId: "kol_b", platform: "douyin", niche: "直播", followers: 80_000 },
      ],
      changeSet: {},
      evidenceRef: "channel:talents",
    };
  },
});
