import type { CommerceBackend } from "../backend/types.js";

export const DOMAINS = [
  "store",
  "catalog",
  "order",
  "crm",
  "marketing",
  "support",
  "finance",
  "risk",
  "channel",
] as const;

export type Domain = (typeof DOMAINS)[number];

export type EffectType =
  | "money_out"
  | "money_in"
  | "coupon_reclaim"
  | "inventory_change"
  | "notify_buyer"
  | "content_change"
  | "state_change";

export interface Effect {
  type: EffectType;
  reversible: boolean;
  note?: string;
}

export type Args = Record<string, unknown>;

export interface CapabilityContext<A extends Args = Args> {
  tenantId: string;
  args: A;
  backend: CommerceBackend;
}

/** 返回 null 表示通过，返回字符串表示未通过的原因。 */
export interface Precondition<A extends Args = Args> {
  id: string;
  describe: string;
  check(ctx: CapabilityContext<A>): string | null;
}

export interface CompensationPlan {
  capability: string;
  args: Args;
}

export interface CapabilityOutput {
  data?: unknown;
  changeSet: Args;
  evidenceRef: string;
}

/**
 * 能力契约：不是 schema，是给自治执行体看的说明书。
 * schema 说明"参数长什么样"，契约还要说明前置条件、副作用、可逆性和已知的坑。
 */
export interface CapabilityContract<A extends Args = Args> {
  name: string;
  namespace: Domain;
  intent: string;
  /** business_intent 表示一次调用内部会编排多个存量微服务，保证原子性。 */
  kind: "query" | "business_intent";
  requiresScope: string[];
  effects: Effect[];
  irreversible: boolean;
  idempotency: "required" | "not_applicable";
  pitfalls: string[];
  onPreconditionFail?: { suggest: string };
  preconditions: Precondition<A>[];
  /** 参与预算与升级判定的金额维度，查询类能力返回 0。 */
  amountOf(args: A): number;
  dryRun(ctx: CapabilityContext<A>): string[];
  execute(ctx: CapabilityContext<A>): CapabilityOutput;
  /**
   * 补偿计划必须在执行时根据"变更前"的状态生成，
   * 事后无法从结果反推出被覆盖的旧值。
   */
  compensationFor?(ctx: CapabilityContext<A>, output: CapabilityOutput): CompensationPlan | null;
}

export type AnyCapabilityContract = CapabilityContract<Args>;

/** 把强类型的契约收敛成注册表可存储的形式，类型擦除只发生在这一处。 */
export function defineCapability<A extends Args>(
  contract: CapabilityContract<A>,
): AnyCapabilityContract {
  return contract as unknown as AnyCapabilityContract;
}
