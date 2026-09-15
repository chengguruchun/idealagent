import type { CommerceBackend } from "./backend/types.js";
import { defaultRegistry } from "./capability/catalog/index.js";
import type { Args, Domain } from "./capability/contract.js";
import type { CapabilityRegistry } from "./capability/registry.js";
import { ExecutionGateway } from "./gateway/execute.js";
import type { CallResult } from "./gateway/result.js";
import { Saga } from "./gateway/saga.js";
import { GrantIssuer, type IssueOptions } from "./grant/issuer.js";
import type { Grant } from "./grant/types.js";
import type { TaskRuntime, ToolHandle } from "./runtime/types.js";
import { TaskPlane, type AdmitOptions, type CallOptions } from "./task/plane.js";
import type { AgentTask } from "./task/types.js";

export interface PlatformOptions {
  backend: CommerceBackend;
  registry?: CapabilityRegistry;
}

/**
 * 组装根。上面的分层之间只允许单向依赖，
 * 只有这里知道所有层的存在并把它们接起来。
 */
export class Platform {
  readonly backend: CommerceBackend;
  readonly registry: CapabilityRegistry;
  readonly grants: GrantIssuer;
  readonly gateway: ExecutionGateway;
  readonly tasks: TaskPlane;

  constructor(options: PlatformOptions) {
    this.backend = options.backend;
    this.registry = options.registry ?? defaultRegistry();
    this.grants = new GrantIssuer();
    this.gateway = new ExecutionGateway({
      registry: this.registry,
      grants: this.grants,
      backend: this.backend,
    });
    this.tasks = new TaskPlane(this.gateway, this.backend);
  }

  issueGrant(options: IssueOptions): Grant {
    return this.grants.issue(options);
  }

  toolsFor(task: AgentTask, saga?: Saga): ToolHandle {
    return {
      call: (capability: string, args: Args, options: CallOptions = {}) =>
        this.tasks.call(task, capability, args, { saga, ...options }),
      preview: (capability: string, args: Args) =>
        this.tasks.call(task, capability, args, { dryRun: true }),
      contract: (name: string) => this.registry.get(name),
      catalog: (namespace?: Domain) => this.registry.summaries(namespace),
    };
  }

  async runTask(
    options: AdmitOptions & { runtime: TaskRuntime; saga?: Saga },
  ): Promise<AgentTask> {
    const { runtime, saga, ...admit } = options;
    const task = this.tasks.admit(admit);
    await runtime.run(task, this.toolsFor(task, saga));
    return this.tasks.settle(task);
  }

  /** 审批通过后继续同一个任务，步数与预算延续原来的账。 */
  async resumeTask(
    task: AgentTask,
    runtime: TaskRuntime,
    saga?: Saga,
  ): Promise<AgentTask> {
    await runtime.run(task, this.toolsFor(task, saga));
    return this.tasks.settle(task);
  }

  rollback(task: AgentTask, saga: Saga): CallResult[] {
    return this.gateway.rollback(saga, {
      tenantId: task.spec.tenantId,
      grantId: task.spec.grantId,
      taskId: task.spec.taskId,
    });
  }
}
