import type { CommerceBackend } from "../backend/types.js";
import type { AnyCapabilityContract, Args, CapabilityContext } from "../capability/contract.js";
import type { CapabilityRegistry } from "../capability/registry.js";
import { checkGrant } from "../grant/check.js";
import type { GrantIssuer } from "../grant/issuer.js";
import { AuditLog } from "./audit.js";
import { BudgetLedger, type Reservation } from "./budget.js";
import { IdempotencyStore } from "./idempotency.js";
import type { AuditRecord, CallResult, CallStatus, CapabilityCall } from "./result.js";
import { Saga } from "./saga.js";

export interface ApprovalRequest {
  approvalId: string;
  tenantId: string;
  taskId?: string;
  grantId: string;
  capability: string;
  args: Args;
  rule: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "consumed";
  approver?: string;
}

export interface GatewayOptions {
  registry: CapabilityRegistry;
  grants: GrantIssuer;
  backend: CommerceBackend;
  audit?: AuditLog;
  budget?: BudgetLedger;
  idempotency?: IdempotencyStore;
  now?: () => Date;
}

/**
 * 执行网关：agent 唯一能碰到存量系统的入口。
 * 授权 → 幂等 → 前置条件 → 预算 → 执行 → 审计，任何一步不过都不会产生副作用。
 */
export class ExecutionGateway {
  readonly audit: AuditLog;
  readonly budget: BudgetLedger;
  readonly idempotency: IdempotencyStore;

  private readonly registry: CapabilityRegistry;
  private readonly grants: GrantIssuer;
  private readonly backend: CommerceBackend;
  private readonly now: () => Date;
  private readonly approvals = new Map<string, ApprovalRequest>();
  private seq = 0;

  constructor(options: GatewayOptions) {
    this.registry = options.registry;
    this.grants = options.grants;
    this.backend = options.backend;
    this.audit = options.audit ?? new AuditLog();
    this.budget = options.budget ?? new BudgetLedger();
    this.idempotency = options.idempotency ?? new IdempotencyStore();
    this.now = options.now ?? (() => new Date());
  }

  execute(call: CapabilityCall, saga?: Saga): CallResult {
    const callId = this.nextId("call");
    const contract = this.registry.get(call.capability);
    if (!contract) {
      return this.record(callId, call, undefined, {
        status: "denied",
        code: "capability_not_found",
        reason: `未注册的能力: ${call.capability}`,
      });
    }

    const grant = this.grants.get(call.grantId);
    if (!grant) {
      return this.record(callId, call, contract, {
        status: "denied",
        code: "grant_not_found",
        reason: `授权不存在: ${call.grantId}`,
      });
    }

    if (contract.idempotency === "required" && !call.idempotencyKey && !call.dryRun) {
      return this.record(callId, call, contract, {
        status: "denied",
        code: "idempotency_key_required",
        reason: `${contract.name} 是写能力，必须携带幂等键`,
      });
    }

    if (call.idempotencyKey && !call.dryRun) {
      const cached = this.idempotency.get(call.tenantId, contract.name, call.idempotencyKey);
      if (cached) {
        return this.record(callId, call, contract, {
          status: "replayed",
          reason: `幂等重放，原调用 ${cached.callId}`,
          data: cached.data,
          changeSet: cached.changeSet,
          evidenceRef: cached.evidenceRef,
        });
      }
    }

    const verdict = checkGrant({
      grant,
      contract,
      tenantId: call.tenantId,
      args: call.args,
      backend: this.backend,
      usedCount: this.budget.usage(grant.grantId).count,
      now: this.now(),
    });

    if (verdict.kind === "deny") {
      return this.record(callId, call, contract, {
        status: "denied",
        code: verdict.code,
        reason: verdict.reason,
      });
    }

    if (verdict.kind === "escalate") {
      const consumed = this.consumeApproval(call, contract);
      if (consumed.kind === "missing") {
        const request = this.createApproval(call, contract, verdict.rule, verdict.reason);
        return this.record(callId, call, contract, {
          status: "requires_approval",
          code: "escalated",
          reason: verdict.reason,
          approvalId: request.approvalId,
        });
      }
      if (consumed.kind === "invalid") {
        return this.record(callId, call, contract, {
          status: "denied",
          code: "approval_invalid",
          reason: consumed.reason,
        });
      }
    }

    const ctx: CapabilityContext = { tenantId: call.tenantId, args: call.args, backend: this.backend };

    for (const precondition of contract.preconditions) {
      const failure = precondition.check(ctx);
      if (failure) {
        return this.record(callId, call, contract, {
          status: "precondition_failed",
          code: precondition.id,
          reason: failure,
          suggest: contract.onPreconditionFail?.suggest,
        });
      }
    }

    if (call.dryRun) {
      return this.record(callId, call, contract, {
        status: "dry_run",
        reason: "预演，未产生任何副作用",
        preview: contract.dryRun(ctx),
      });
    }

    const reserved = this.budget.reserve(grant, contract.amountOf(call.args));
    if (!reserved.ok) {
      return this.record(callId, call, contract, {
        status: "denied",
        code: "budget_exceeded",
        reason: reserved.reason,
      });
    }
    const reservation: Reservation = reserved.reservation;

    try {
      const output = contract.execute(ctx);

      if (saga) {
        saga.record({
          callId,
          capability: contract.name,
          compensation: contract.compensationFor?.(ctx, output) ?? null,
          irreversible: contract.irreversible,
        });
      }

      const result = this.record(callId, call, contract, {
        status: "ok",
        data: output.data,
        changeSet: output.changeSet,
        evidenceRef: output.evidenceRef,
      });

      if (call.idempotencyKey) {
        this.idempotency.set(call.tenantId, contract.name, call.idempotencyKey, result);
      }
      return result;
    } catch (error) {
      this.budget.release(reservation);
      return this.record(callId, call, contract, {
        status: "error",
        code: "execution_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** 按执行逆序补偿。不可逆步骤无法回滚，如实返回而不是假装成功。 */
  rollback(saga: Saga, ctx: { tenantId: string; grantId: string; taskId?: string }): CallResult[] {
    const results: CallResult[] = [];
    for (const step of saga.plan()) {
      if (!step.compensation) {
        results.push({
          callId: this.nextId("comp"),
          capability: step.capability,
          status: "error",
          code: "not_compensable",
          reason: step.irreversible
            ? `${step.capability} 不可逆，无法回滚`
            : `${step.capability} 未声明补偿动作`,
        });
        continue;
      }
      results.push(
        this.execute({
          tenantId: ctx.tenantId,
          grantId: ctx.grantId,
          taskId: ctx.taskId,
          capability: step.compensation.capability,
          args: step.compensation.args,
          idempotencyKey: `${saga.sagaId}:comp:${step.callId}`,
          parentCallId: step.callId,
        }),
      );
    }
    return results;
  }

  pendingApprovals(taskId?: string): ApprovalRequest[] {
    return [...this.approvals.values()].filter(
      (item) => item.status === "pending" && (!taskId || item.taskId === taskId),
    );
  }

  getApproval(approvalId: string): ApprovalRequest | undefined {
    return this.approvals.get(approvalId);
  }

  approve(approvalId: string, approver: string): boolean {
    const request = this.approvals.get(approvalId);
    if (!request || request.status !== "pending") return false;
    request.status = "approved";
    request.approver = approver;
    return true;
  }

  reject(approvalId: string, approver: string): boolean {
    const request = this.approvals.get(approvalId);
    if (!request || request.status !== "pending") return false;
    request.status = "rejected";
    request.approver = approver;
    return true;
  }

  private consumeApproval(
    call: CapabilityCall,
    contract: AnyCapabilityContract,
  ): { kind: "ok" } | { kind: "missing" } | { kind: "invalid"; reason: string } {
    if (!call.approvalRef) return { kind: "missing" };
    const request = this.approvals.get(call.approvalRef);
    if (!request) return { kind: "invalid", reason: `审批单不存在: ${call.approvalRef}` };
    if (request.status !== "approved") {
      return { kind: "invalid", reason: `审批单状态为 ${request.status}，不可用于放行` };
    }
    if (request.tenantId !== call.tenantId || request.capability !== contract.name) {
      return { kind: "invalid", reason: "审批单与本次调用不匹配" };
    }
    request.status = "consumed";
    return { kind: "ok" };
  }

  private createApproval(
    call: CapabilityCall,
    contract: AnyCapabilityContract,
    rule: string,
    reason: string,
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      approvalId: this.nextId("apr"),
      tenantId: call.tenantId,
      taskId: call.taskId,
      grantId: call.grantId,
      capability: contract.name,
      args: call.args,
      rule,
      reason,
      status: "pending",
    };
    this.approvals.set(request.approvalId, request);
    return request;
  }

  private record(
    callId: string,
    call: CapabilityCall,
    contract: AnyCapabilityContract | undefined,
    partial: Omit<CallResult, "callId" | "capability"> & { status: CallStatus },
  ): CallResult {
    const result: CallResult = { callId, capability: call.capability, ...partial };
    const record: AuditRecord = {
      callId,
      at: this.now().toISOString(),
      tenantId: call.tenantId,
      taskId: call.taskId,
      grantId: call.grantId,
      capability: call.capability,
      args: call.args,
      status: result.status,
      code: result.code,
      reason: result.reason,
      parentCallId: call.parentCallId,
      effects: contract?.effects,
      changeSet: result.changeSet,
      evidenceRef: result.evidenceRef,
    };
    this.audit.append(record);
    return result;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, "0")}`;
  }
}
