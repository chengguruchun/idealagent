import type { CommerceBackend } from "../backend/types.js";
import type { AnyCapabilityContract, Args } from "../capability/contract.js";
import { matchEscalation } from "./escalation.js";
import { applyFilters } from "./filters.js";
import type { Grant, GrantVerdict } from "./types.js";

export interface CheckInput {
  grant: Grant;
  contract: AnyCapabilityContract;
  tenantId: string;
  args: Args;
  backend: CommerceBackend;
  /** 本次授权已经用掉的次数，供升级规则引用。 */
  usedCount: number;
  now?: Date;
}

/**
 * 只做静态策略判定：身份、作用域、时间窗、过滤器、单次上限、升级规则。
 * 累计预算是有状态的，交给 L3 的账本，避免授权层持有可变状态。
 */
export function checkGrant(input: CheckInput): GrantVerdict {
  const { grant, contract, tenantId, args, backend } = input;
  const now = input.now ?? new Date();

  if (grant.revoked) {
    return { kind: "deny", code: "revoked", reason: `授权 ${grant.grantId} 已撤销` };
  }
  if (grant.tenantId !== tenantId) {
    return { kind: "deny", code: "tenant", reason: "授权与调用租户不一致" };
  }
  if (!coversScope(grant.scope, contract.name)) {
    return {
      kind: "deny",
      code: "scope",
      reason: `授权作用域 [${grant.scope.join(", ")}] 不覆盖 ${contract.name}`,
    };
  }

  const from = Date.parse(grant.constraints.window.from);
  const to = Date.parse(grant.constraints.window.to);
  if (now.getTime() < from || now.getTime() > to) {
    return {
      kind: "deny",
      code: "window",
      reason: `不在授权时间窗 ${grant.constraints.window.from} ~ ${grant.constraints.window.to} 内`,
    };
  }

  const filterReason = applyFilters(grant.constraints.filters, { tenantId, args, backend });
  if (filterReason) {
    return { kind: "deny", code: "filter", reason: filterReason };
  }

  const amount = contract.amountOf(args);
  const perCall = grant.constraints.amount?.perCall;
  if (perCall !== undefined && amount > perCall) {
    return {
      kind: "deny",
      code: "amount_per_call",
      reason: `单次金额 ${amount} 超过授权上限 ${perCall}`,
    };
  }

  const escalation = matchEscalation(grant.escalate, { amount, count: input.usedCount });
  if (escalation) {
    return { kind: "escalate", rule: escalation.rule, reason: escalation.reason };
  }

  return { kind: "allow" };
}

function coversScope(scope: string[], capability: string): boolean {
  const namespace = capability.split(".")[0];
  return scope.some((item) => item === capability || item === `${namespace}.*` || item === "*");
}
