import type { Args, Effect } from "../capability/contract.js";

export type CallStatus =
  | "ok"
  | "dry_run"
  | "replayed"
  | "denied"
  | "requires_approval"
  | "precondition_failed"
  | "error";

export interface CapabilityCall {
  tenantId: string;
  capability: string;
  args: Args;
  grantId: string;
  taskId?: string;
  idempotencyKey?: string;
  parentCallId?: string;
  dryRun?: boolean;
  approvalRef?: string;
}

export interface CallResult {
  callId: string;
  capability: string;
  status: CallStatus;
  code?: string;
  reason?: string;
  data?: unknown;
  changeSet?: Args;
  evidenceRef?: string;
  preview?: string[];
  suggest?: string;
  approvalId?: string;
}

export interface AuditRecord {
  callId: string;
  at: string;
  tenantId: string;
  taskId?: string;
  grantId: string;
  capability: string;
  args: Args;
  status: CallStatus;
  code?: string;
  reason?: string;
  parentCallId?: string;
  effects?: Effect[];
  changeSet?: Args;
  evidenceRef?: string;
}

export function isSuccess(result: CallResult): boolean {
  return result.status === "ok" || result.status === "replayed";
}
