import { detectKeys, loadEnv } from "../config.js";
import { piObserveRuntime } from "../pi-observe.js";
import { seedCommerce } from "./backend/in-memory.js";
import { Platform } from "./platform.js";
import type { TenantProfile } from "./tenant/profile.js";

const profile: TenantProfile = {
  tenantId: "shop-pi",
  memory: [],
  uiPrefs: { home: "campaign", tone: "concise" },
  merchandisingStrategy: { focus: "repurchase", notes: "老客复购" },
  marketingStrategy: { channel: "coupon", notes: "店内券优先" },
  reportPrefs: { highlight: "gmv" },
};

async function main(): Promise<void> {
  loadEnv();
  if (!Object.keys(detectKeys()).length) {
    console.error("没有 API Key，无法启动 Pi 观察车道。请配置 DASHSCOPE_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY。");
    process.exitCode = 1;
    return;
  }

  const backend = seedCommerce(profile.tenantId);
  const app = new Platform({ backend });
  app.tenants.seed(profile);

  const observeGrant = app.issueGrant({
    tenantId: profile.tenantId,
    agent: "pi-observe",
    scope: ["catalog.*", "crm.*", "channel.*"],
    constraints: { ttlMinutes: 120 },
  });
  const playGrant = app.issueGrant({
    tenantId: profile.tenantId,
    agent: "pi-observe",
    scope: ["marketing.*", "catalog.*"],
    constraints: { amount: { currency: "CNY", perCall: 200, total: 500 } },
  });

  const result = await app.operate({
    tenantId: profile.tenantId,
    observeGrantId: observeGrant.grantId,
    playbookGrantId: playGrant.grantId,
    goal: "根据本店画像做一轮经营观察，必要时提议一条店内动作",
    runtime: piObserveRuntime(),
  });

  console.log(`home=${result.ui.home} report=${result.report.title}`);
  console.log(
    "proposals:",
    result.observe.status.proposals.map((item) => `${item.capability} ${item.status} ${item.reason}`),
  );
  console.log("coupons:", backend.listCoupons(profile.tenantId).map((item) => item.couponId));
  console.log("prd_2:", backend.getProduct(profile.tenantId, "prd_2")?.price);
  console.log("memory:", result.tenant.memory.at(-1));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
