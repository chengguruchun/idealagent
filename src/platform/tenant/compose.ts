import type { TenantProfile } from "./profile.js";

export interface UiView {
  tenantId: string;
  home: TenantProfile["uiPrefs"]["home"];
  tone: TenantProfile["uiPrefs"]["tone"];
  modules: string[];
  merchandisingFocus: TenantProfile["merchandisingStrategy"]["focus"];
}

export interface ReportView {
  tenantId: string;
  highlight: TenantProfile["reportPrefs"]["highlight"];
  title: string;
  sections: Array<{ heading: string; body: string }>;
}

const HOME_MODULES: Record<TenantProfile["uiPrefs"]["home"], string[]> = {
  aftersale: ["积压售后", "退款时效", "差评"],
  live: ["直播场次", "讲解商品", "实时成交"],
  campaign: ["进行中活动", "券核销", "叠加冲突"],
  report: ["本周经营摘要", "渠道对比"],
};

/**
 * UI / 报告按 TenantProfile 拼，不按平台标准页。
 * 数据由观察车道 query 而来，这里只做呈现决策。
 */
export function composeUi(profile: TenantProfile): UiView {
  return {
    tenantId: profile.tenantId,
    home: profile.uiPrefs.home,
    tone: profile.uiPrefs.tone,
    modules: HOME_MODULES[profile.uiPrefs.home],
    merchandisingFocus: profile.merchandisingStrategy.focus,
  };
}

export function composeReport(profile: TenantProfile, facts: Record<string, unknown> = {}): ReportView {
  const highlight = profile.reportPrefs.highlight;
  const titles = {
    roi: "达人 / 内容投放 ROI",
    refund: "售后与退款结构",
    gmv: "成交与经营摘要",
  };
  return {
    tenantId: profile.tenantId,
    highlight,
    title: titles[highlight],
    sections: [
      {
        heading: "策略",
        body: `${profile.merchandisingStrategy.notes}；${profile.marketingStrategy.notes}`,
      },
      {
        heading: "观察",
        body: typeof facts.summary === "string" ? facts.summary : JSON.stringify(facts),
      },
    ],
  };
}
