import type { Grant, GrantConstraints } from "./types.js";

export interface IssueOptions {
  tenantId: string;
  agent: string;
  taskId?: string;
  scope: string[];
  constraints: Omit<GrantConstraints, "window"> & { window?: GrantConstraints["window"]; ttlMinutes?: number };
  escalate?: string[];
}

export class GrantIssuer {
  private readonly grants = new Map<string, Grant>();
  private seq = 0;

  issue(options: IssueOptions): Grant {
    this.seq += 1;
    const now = new Date();
    const { ttlMinutes = 120, window, ...rest } = options.constraints;
    const grant: Grant = {
      grantId: `gr_${this.seq.toString().padStart(4, "0")}`,
      tenantId: options.tenantId,
      issuedTo: { agent: options.agent, taskId: options.taskId },
      scope: options.scope,
      constraints: {
        ...rest,
        window: window ?? {
          from: now.toISOString(),
          to: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
        },
      },
      escalate: options.escalate ?? [],
      issuedAt: now.toISOString(),
      revoked: false,
    };
    this.grants.set(grant.grantId, grant);
    return grant;
  }

  get(grantId: string): Grant | undefined {
    return this.grants.get(grantId);
  }

  revoke(grantId: string): boolean {
    const grant = this.grants.get(grantId);
    if (!grant) return false;
    grant.revoked = true;
    return true;
  }

  listForTenant(tenantId: string): Grant[] {
    return [...this.grants.values()].filter((item) => item.tenantId === tenantId);
  }
}
