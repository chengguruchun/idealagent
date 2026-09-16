import type { CommerceBackend } from "./backend/types.js";
import { defaultRegistry } from "./capability/catalog/index.js";
import type { Args, Domain } from "./capability/contract.js";
import type { CapabilityRegistry } from "./capability/registry.js";
import { ExecutionGateway } from "./gateway/execute.js";
import type { CallResult } from "./gateway/result.js";
import { Saga } from "./gateway/saga.js";
import { GrantIssuer, type IssueOptions } from "./grant/issuer.js";
import type { Grant } from "./grant/types.js";
import { defaultOperateRuntime } from "./runtime/operate.js";
import { scriptedRuntime } from "./runtime/scripted.js";
import type {
  CatalogItem,
  ObserveHandle,
  ObserveRuntime,
  PlaybookHandle,
  PlaybookRuntime,
  ToolHandle,
} from "./runtime/types.js";
import { TaskPlane, type AdmitOptions, type CallOptions } from "./task/plane.js";
import type { AgentTask, Proposal } from "./task/types.js";
import { composeReport, composeUi, type ReportView, type UiView } from "./tenant/compose.js";
import { TenantDirectory } from "./tenant/directory.js";
import type { TenantProfile, TenantProfilePatch } from "./tenant/profile.js";

export interface PlatformOptions {
  backend: CommerceBackend;
  registry?: CapabilityRegistry;
  tenants?: TenantDirectory;
}

export interface ObserveResult {
  task: AgentTask;
  ui: UiView;
  report: ReportView;
}

export interface OperateResult {
  tenant: TenantProfile;
  ui: UiView;
  report: ReportView;
  observe: AgentTask;
  playbook?: AgentTask;
}

/**
 * 组装根。分层之间只允许单向依赖，只有这里知道所有层。
 */
export class Platform {
  readonly backend: CommerceBackend;
  readonly registry: CapabilityRegistry;
  readonly grants: GrantIssuer;
  readonly gateway: ExecutionGateway;
  readonly tasks: TaskPlane;
  readonly tenants: TenantDirectory;

  constructor(options: PlatformOptions) {
    this.backend = options.backend;
    this.registry = options.registry ?? defaultRegistry();
    this.grants = new GrantIssuer();
    this.tenants = options.tenants ?? new TenantDirectory();
    this.gateway = new ExecutionGateway({
      registry: this.registry,
      grants: this.grants,
      backend: this.backend,
    });
    this.tasks = new TaskPlane(this.gateway, this.backend, {
      kindOf: (name) => this.registry.get(name)?.kind,
    });
  }

  issueGrant(options: IssueOptions): Grant {
    return this.grants.issue(options);
  }

  learn(tenantId: string, patch: TenantProfilePatch): TenantProfile {
    return this.tenants.learn(tenantId, patch);
  }

  toolsFor(task: AgentTask, saga?: Saga): PlaybookHandle {
    return {
      call: (capability: string, args: Args, options: CallOptions = {}) =>
        this.tasks.call(task, capability, args, { saga, ...options }),
      preview: (capability: string, args: Args) =>
        this.tasks.call(task, capability, args, { dryRun: true }),
      contract: (name: string) => this.registry.get(name),
      catalog: (namespace?: Domain) => this.summaries(namespace),
    };
  }

  observeFor(task: AgentTask): ObserveHandle {
    const profile = () => this.tenants.get(task.spec.tenantId);
    return {
      query: (capability: string, args: Args = {}) => this.tasks.call(task, capability, args),
      profile,
      composeUi: () => composeUi(profile()),
      composeReport: (facts = {}) => composeReport(profile(), facts),
      propose: (capability: string, args: Args, reason: string) =>
        this.tasks.propose(task, capability, args, reason),
      contract: (name: string) => this.registry.get(name),
      catalog: (namespace?: Domain) => this.summaries(namespace).filter((item) => item.kind === "query"),
      playbooks: (namespace?: Domain) =>
        this.summaries(namespace).filter((item) => item.kind === "business_intent"),
    };
  }

  async runTask(
    options: AdmitOptions & { runtime: PlaybookRuntime; saga?: Saga },
  ): Promise<AgentTask> {
    const { runtime, saga, ...admit } = options;
    const task = this.tasks.admit({ ...admit, runtimeClass: admit.runtimeClass ?? "playbook" });
    await runtime.run(task, this.toolsFor(task, saga));
    return this.tasks.settle(task);
  }

  async runObserve(
    options: AdmitOptions & { runtime: ObserveRuntime },
  ): Promise<ObserveResult> {
    const { runtime, ...admit } = options;
    const task = this.tasks.admit({ ...admit, runtimeClass: "observe" });
    const tools = this.observeFor(task);
    await runtime.run(task, tools);
    return {
      task: this.tasks.settle(task),
      ui: tools.composeUi(),
      report: tools.composeReport(),
    };
  }

  async resumeTask(
    task: AgentTask,
    runtime: PlaybookRuntime,
    saga?: Saga,
  ): Promise<AgentTask> {
    await runtime.run(task, this.toolsFor(task, saga));
    return this.tasks.settle(task);
  }

  /** 把观察车道的 pending 提议交给执行车道，模型不在环内。 */
  async fulfillProposals(
    observe: AgentTask,
    playbookGrantId: string,
    saga?: Saga,
  ): Promise<AgentTask | undefined> {
    const pending = observe.status.proposals.filter((item) => item.status === "pending");
    if (pending.length === 0) return undefined;

    const steps = pending.map((item) => ({
      capability: item.capability,
      args: item.args,
      options: { idempotencyKey: `${observe.spec.taskId}:${item.proposalId}` },
    }));

    const playbook = await this.runTask({
      taskId: `${observe.spec.taskId}:play`,
      tenantId: observe.spec.tenantId,
      goal: `兑现 ${pending.length} 条经营提议`,
      grantId: playbookGrantId,
      successCriteria: [],
      runtimeClass: "playbook",
      runtime: scriptedRuntime(steps),
      saga,
    });

    for (const item of pending) {
      item.status = playbook.status.calls.some(
        (call) => call.capability === item.capability && (call.status === "ok" || call.status === "replayed"),
      )
        ? "accepted"
        : "rejected";
    }
    return playbook;
  }

  /**
   * 经营环架子：观察（策略/UI/报告/提议）→ 兑现 Playbook → Learn 回写该租户记忆。
   */
  async operate(input: {
    tenantId: string;
    observeGrantId: string;
    playbookGrantId: string;
    goal?: string;
    runtime?: ObserveRuntime;
  }): Promise<OperateResult> {
    const observed = await this.runObserve({
      taskId: `op_${input.tenantId}_${Date.now()}`,
      tenantId: input.tenantId,
      goal: input.goal ?? "本周经营：选品、呈现、提议一条可执行动作",
      grantId: input.observeGrantId,
      successCriteria: [],
      runtime: input.runtime ?? defaultOperateRuntime(),
    });

    const playbook = await this.fulfillProposals(observed.task, input.playbookGrantId);
    const accepted = observed.task.status.proposals.filter((item) => item.status === "accepted");
    this.tenants.learn(input.tenantId, {
      memoryNote: accepted.length
        ? `兑现 ${accepted.map((item) => item.capability).join(",")}`
        : "本轮无兑现，仅更新观察",
    });

    return {
      tenant: this.tenants.get(input.tenantId),
      ui: observed.ui,
      report: observed.report,
      observe: observed.task,
      playbook,
    };
  }

  rollback(task: AgentTask, saga: Saga): CallResult[] {
    return this.gateway.rollback(saga, {
      tenantId: task.spec.tenantId,
      grantId: task.spec.grantId,
      taskId: task.spec.taskId,
    });
  }

  private summaries(namespace?: Domain): CatalogItem[] {
    return this.registry.summaries(namespace);
  }
}

export type { Proposal, ToolHandle };
