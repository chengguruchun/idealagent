import type { CallResult } from "./result.js";

export class IdempotencyStore {
  private readonly entries = new Map<string, CallResult>();

  private key(tenantId: string, capability: string, idempotencyKey: string): string {
    return `${tenantId}|${capability}|${idempotencyKey}`;
  }

  get(tenantId: string, capability: string, idempotencyKey: string): CallResult | undefined {
    return this.entries.get(this.key(tenantId, capability, idempotencyKey));
  }

  set(tenantId: string, capability: string, idempotencyKey: string, result: CallResult): void {
    this.entries.set(this.key(tenantId, capability, idempotencyKey), result);
  }
}
