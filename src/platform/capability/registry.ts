import type { AnyCapabilityContract, Domain } from "./contract.js";

export class CapabilityRegistry {
  private readonly byName = new Map<string, AnyCapabilityContract>();

  register(...contracts: AnyCapabilityContract[]): this {
    for (const contract of contracts) {
      if (this.byName.has(contract.name)) {
        throw new Error(`能力重复注册: ${contract.name}`);
      }
      if (contract.kind === "business_intent" && contract.idempotency !== "required") {
        throw new Error(`写能力必须要求幂等键: ${contract.name}`);
      }
      if (contract.irreversible && contract.compensationFor) {
        throw new Error(`不可逆能力不应声明补偿动作: ${contract.name}`);
      }
      this.byName.set(contract.name, contract);
    }
    return this;
  }

  get(name: string): AnyCapabilityContract | undefined {
    return this.byName.get(name);
  }

  list(namespace?: Domain): AnyCapabilityContract[] {
    const all = [...this.byName.values()];
    return namespace ? all.filter((item) => item.namespace === namespace) : all;
  }

  /**
   * 工具目录规模化之后，agent 塞不下全部契约。
   * 这里给的是分级披露的最小形态：先给意图摘要，用到了再取完整契约。
   */
  summaries(namespace?: Domain): Array<{ name: string; intent: string; irreversible: boolean }> {
    return this.list(namespace).map((item) => ({
      name: item.name,
      intent: item.intent,
      irreversible: item.irreversible,
    }));
  }
}
