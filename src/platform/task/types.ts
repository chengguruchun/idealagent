import type { CommerceBackend } from "../backend/types.js";
import type { CallResult } from "../gateway/result.js";

export type TaskPhase =
  | "Pending"
  | "Running"
  | "AwaitingApproval"
  | "Succeeded"
  | "Failed"
  | "Blocked";

export type ConditionType =
  | "ProxyChecksPassed"
  | "RealOutcomeVerified"
  | "ApprovalRequired"
  | "BudgetExhausted";

export interface TaskCondition {
  type: ConditionType;
  status: boolean;
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  detail: string;
  evidenceRef?: string;
}

/**
 * 成功判据只拿得到 backend 和 tenantId。
 * 它物理上看不到 agent 声称自己做了什么，只能去查世界的真实状态——
 * 这是 Proxy 与 Real Outcome 之间那道墙。
 */
export interface OutcomeCheck {
  id: string;
  describe: string;
  verify(backend: CommerceBackend, tenantId: string): VerifyResult;
}

export interface TaskSpec {
  taskId: string;
  tenantId: string;
  goal: string;
  grantId: string;
  successCriteria: OutcomeCheck[];
  budget: { maxSteps: number };
}

export interface Outcome {
  complete: boolean;
  evidenceRefs: string[];
  unmet: string[];
  note: string;
}

export interface AgentTask {
  spec: TaskSpec;
  status: {
    phase: TaskPhase;
    steps: number;
    calls: CallResult[];
    conditions: TaskCondition[];
    outcome: Outcome;
    pendingApprovalId?: string;
  };
}

export function condition(task: AgentTask, type: ConditionType): boolean {
  return task.status.conditions.some((item) => item.type === type && item.status);
}
