import type { AuditRecord } from "./result.js";

/**
 * 每一次尝试都记，包括被拒绝的。
 * agent 是不可信执行体，事后要能回答"谁、凭哪个授权、看到了什么、改了什么"。
 * 这份记录同时也是 Outcome 回流的原料。
 */
export class AuditLog {
  private readonly records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  all(): AuditRecord[] {
    return [...this.records];
  }

  byTask(taskId: string): AuditRecord[] {
    return this.records.filter((item) => item.taskId === taskId);
  }

  byGrant(grantId: string): AuditRecord[] {
    return this.records.filter((item) => item.grantId === grantId);
  }

  /** 沿 parentCallId 还原一次调用的因果链。 */
  chain(callId: string): AuditRecord[] {
    const byId = new Map(this.records.map((item) => [item.callId, item]));
    const chain: AuditRecord[] = [];
    let cursor = byId.get(callId);
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parentCallId ? byId.get(cursor.parentCallId) : undefined;
    }
    return chain;
  }
}
