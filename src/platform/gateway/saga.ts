import type { CompensationPlan } from "../capability/contract.js";

export interface SagaStep {
  callId: string;
  capability: string;
  compensation: CompensationPlan | null;
  irreversible: boolean;
}

/**
 * 一组要么一起成立、要么一起撤销的调用。
 * 注意补偿计划是执行时生成的：被覆盖的旧值事后推不出来。
 * 含不可逆步骤的 saga 无法完整回滚，这里如实暴露而不是假装成功。
 */
export class Saga {
  readonly steps: SagaStep[] = [];

  constructor(readonly sagaId: string) {}

  record(step: SagaStep): void {
    this.steps.push(step);
  }

  /** 需要补偿的步骤，按执行的逆序。 */
  plan(): SagaStep[] {
    return [...this.steps].reverse();
  }

  irreversibleSteps(): SagaStep[] {
    return this.steps.filter((step) => step.irreversible);
  }
}
