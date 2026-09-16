export type UiHome = "aftersale" | "live" | "campaign" | "report";
export type MerchandisingFocus = "repurchase" | "new_arrival" | "trend";
export type MarketingChannel = "xiaohongshu" | "kol" | "coupon" | "live";
export type ReportHighlight = "roi" | "refund" | "gmv";

/**
 * 每租户一份。交易履约不写在这里。
 * 后面接真实店铺时，策略字段按域加，不要改 Playbook。
 */
export interface TenantProfile {
  tenantId: string;
  memory: string[];
  uiPrefs: { home: UiHome; tone: "concise" | "detailed" };
  merchandisingStrategy: { focus: MerchandisingFocus; notes: string };
  marketingStrategy: { channel: MarketingChannel; notes: string };
  reportPrefs: { highlight: ReportHighlight };
}

export type TenantProfilePatch = Partial<
  Pick<TenantProfile, "uiPrefs" | "merchandisingStrategy" | "marketingStrategy" | "reportPrefs">
> & { memoryNote?: string };

export function defaultProfile(tenantId: string): TenantProfile {
  return {
    tenantId,
    memory: [],
    uiPrefs: { home: "aftersale", tone: "concise" },
    merchandisingStrategy: { focus: "repurchase", notes: "默认先做老客复购" },
    marketingStrategy: { channel: "coupon", notes: "默认店内券" },
    reportPrefs: { highlight: "gmv" },
  };
}
