import type { CommerceBackend } from "../backend/types.js";
import type { Args } from "../capability/contract.js";
import type { ExecutionGateway } from "../gateway/execute.js";
import { isSuccess, type CallResult } from "../gateway/result.js";
import type { Saga } from "../gateway/saga.js";
import type { AgentTask, OutcomeCheck, TaskCondition, TaskPhase, TaskSpec } from "./types.js";

export interface AdmitOptions {
  taskId: string;
  tenantId: string;
  goal: string;
  grantId: string;
  successCriteria: OutcomeCheck[];
  maxSteps?: number;
}

export interface CallOptions {
  idempotencyKey?: string;
  dryRun?: boolean;
  approvalRef?: string;
  parentCallId?: string;
  saga?: Saga;
}

export class TaskPlane {
  constructor(
    private readonly gateway: ExecutionGateway,
    private readonly backend: CommerceBackend,
  ) {}

  admit(options: AdmitOptions): AgentTask {
    const spec: TaskSpec = {
      taskId: options.taskId,
      tenantId: options.tenantId,
      goal: options.goal,
      grantId: options.grantId,
      successCriteria: options.successCriteria,
      budget: { maxSteps: options.maxSteps ?? 8 },
    };
    return {
      spec,
      status: {
        phase: "Running",
        steps: 0,
        calls: [],
        conditions: [],
        outcome: { complete: false, evidenceRefs: [], unmet: [], note: "admitted" },
      },
    };
  }

  call(task: AgentTask, capability: string, args: Args, options: CallOptions = {}): CallResult {
    if (task.status.phase === "Succeeded" || task.status.phase === "Failed") {
      return {
        callId: "call_none",
        capability,
        status: "denied",
        code: "task_terminal",
        reason: `任务已处于终态 ${task.status.phase}`,
      };
    }
    if (task.status.steps >= task.spec.budget.maxSteps) {
      task.status.phase = "Blocked";
      return {
        callId: "call_none",
        capability,
        status: "denied",
        code: "step_budget_exhausted",
        reason: `步数预算 ${task.spec.budget.maxSteps} 用尽`,
      };
    }

    const result = this.gateway.execute(
      {
        tenantId: task.spec.tenantId,
        grantId: task.spec.grantId,
        taskId: task.spec.taskId,
        capability,
        args,
        idempotencyKey: options.idempotencyKey,
        dryRun: options.dryRun,
        approvalRef: options.approvalRef,
        parentCallId: options.parentCallId,
      },
      options.saga,
    );

    task.status.steps += 1;
    task.status.calls.push(result);

    if (result.status === "requires_approval") {
      task.status.phase = "AwaitingApproval";
      task.status.pendingApprovalId = result.approvalId;
    } else if (task.status.phase === "AwaitingApproval" && isSuccess(result)) {
      task.status.phase = "Running";
      task.status.pendingApprovalId = undefined;
    }

    return result;
  }

  approve(task: AgentTask, approver: string): string | undefined {
    const approvalId = task.status.pendingApprovalId;
    if (!approvalId) return undefined;
    return this.gateway.approve(approvalId, approver) ? approvalId : undefined;
  }

  /**
   * 跑成功判据，然后落条件与相位。
   * 关键点：判据读的是 backend 的真实状态，不是 task.status.calls 里 agent 的自述。
   */
  settle(task: AgentTask): AgentTask {
    const evidenceRefs: string[] = [];
    const unmet: string[] = [];

    for (const check of task.spec.successCriteria) {
      const verdict = check.verify(this.backend, task.spec.tenantId);
      if (verdict.ok) {
        if (verdict.evidenceRef) evidenceRefs.push(verdict.evidenceRef);
      } else {
        unmet.push(`${check.id}: ${verdict.detail}`);
      }
    }

    const real = unmet.length === 0 && task.spec.successCriteria.length > 0;
    const failedCalls = task.status.calls.filter(
      (item) =>
        item.status === "error" ||
        item.status === "denied" ||
        item.status === "precondition_failed",
    );
    const proxy = failedCalls.length === 0 && task.status.calls.length > 0;
    const awaitingApproval = task.status.phase === "AwaitingApproval";
    const budgetExhausted = task.status.steps >= task.spec.budget.maxSteps;

    const conditions: TaskCondition[] = [
      {
        type: "ProxyChecksPassed",
        status: proxy,
        detail: proxy ? "所有调用均未被拒绝或报错" : `${failedCalls.length} 次调用未通过`,
      },
      {
        type: "RealOutcomeVerified",
        status: real,
        detail: real ? "外部状态已满足全部成功判据" : unmet.join("; ") || "无成功判据",
      },
      {
        type: "ApprovalRequired",
        status: awaitingApproval,
        detail: awaitingApproval ? `等待审批 ${task.status.pendingApprovalId}` : "无待审批项",
      },
      {
        type: "BudgetExhausted",
        status: budgetExhausted,
        detail: `${task.status.steps}/${task.spec.budget.maxSteps} 步`,
      },
    ];

    task.status.conditions = conditions;
    task.status.outcome = {
      complete: real,
      evidenceRefs,
      unmet,
      note: real ? "成功判据全部通过" : unmet.join("; ") || "尚未达成",
    };
    task.status.phase = phaseOf({ real, awaitingApproval, budgetExhausted });
    return task;
  }
}

function phaseOf(input: {
  real: boolean;
  awaitingApproval: boolean;
  budgetExhausted: boolean;
}): TaskPhase {
  if (input.real) return "Succeeded";
  if (input.awaitingApproval) return "AwaitingApproval";
  if (input.budgetExhausted) return "Failed";
  return "Running";
}
