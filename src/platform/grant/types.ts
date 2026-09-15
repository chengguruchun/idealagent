export interface GrantConstraints {
  amount?: {
    currency: string;
    /** 单次调用金额上限，超过直接拒绝。 */
    perCall?: number;
    /** 本次授权累计可动用的金额。 */
    total?: number;
  };
  count?: { total?: number };
  window: { from: string; to: string };
  /** 具名过滤器，未知的过滤器一律拒绝，不会被静默忽略。 */
  filters?: Record<string, unknown>;
}

/**
 * 按任务签发的授权，而不是按应用签发的 API key。
 * 语义从"我信任这个应用"变成"我批准你去做这一件事，花不超过 N 元，M 小时内有效"。
 */
export interface Grant {
  grantId: string;
  tenantId: string;
  issuedTo: { agent: string; taskId?: string };
  /** 支持 "order.refund" 精确匹配与 "order.*" 命名空间匹配。 */
  scope: string[];
  constraints: GrantConstraints;
  /** 命中即转人工审批的规则，形如 "amount > 100"。 */
  escalate: string[];
  issuedAt: string;
  revoked: boolean;
}

export type DenyCode =
  | "revoked"
  | "tenant"
  | "scope"
  | "window"
  | "filter"
  | "amount_per_call";

export type GrantVerdict =
  | { kind: "allow" }
  | { kind: "deny"; code: DenyCode; reason: string }
  | { kind: "escalate"; rule: string; reason: string };
