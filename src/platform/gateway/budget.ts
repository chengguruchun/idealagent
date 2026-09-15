import type { Grant } from "../grant/types.js";

export interface Usage {
  amount: number;
  count: number;
}

export interface Reservation {
  grantId: string;
  amount: number;
}

/**
 * agent 会自己重试、会进循环，所以额度必须在服务端强制，
 * 而且要先占用再结算：执行失败要把额度还回去，dry-run 不占额度。
 */
export class BudgetLedger {
  private readonly used = new Map<string, Usage>();

  usage(grantId: string): Usage {
    return this.used.get(grantId) ?? { amount: 0, count: 0 };
  }

  reserve(grant: Grant, amount: number): { ok: true; reservation: Reservation } | { ok: false; reason: string } {
    const current = this.usage(grant.grantId);
    const totalAmount = grant.constraints.amount?.total;
    const totalCount = grant.constraints.count?.total;

    if (totalCount !== undefined && current.count + 1 > totalCount) {
      return { ok: false, reason: `调用次数已达授权上限 ${totalCount}` };
    }
    if (totalAmount !== undefined && current.amount + amount > totalAmount) {
      return {
        ok: false,
        reason: `累计金额 ${current.amount} + 本次 ${amount} 超过授权额度 ${totalAmount}`,
      };
    }

    this.used.set(grant.grantId, { amount: current.amount + amount, count: current.count + 1 });
    return { ok: true, reservation: { grantId: grant.grantId, amount } };
  }

  release(reservation: Reservation): void {
    const current = this.usage(reservation.grantId);
    this.used.set(reservation.grantId, {
      amount: Math.max(0, current.amount - reservation.amount),
      count: Math.max(0, current.count - 1),
    });
  }
}
