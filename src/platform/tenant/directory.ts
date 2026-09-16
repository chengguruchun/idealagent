import {
  defaultProfile,
  type TenantProfile,
  type TenantProfilePatch,
} from "./profile.js";

/** 租户画像目录。Learn 只回写这一份，不回写 Playbook。 */
export class TenantDirectory {
  private readonly profiles = new Map<string, TenantProfile>();

  get(tenantId: string): TenantProfile {
    const existing = this.profiles.get(tenantId);
    if (existing) return existing;
    const created = defaultProfile(tenantId);
    this.profiles.set(tenantId, created);
    return created;
  }

  seed(profile: TenantProfile): TenantProfile {
    this.profiles.set(profile.tenantId, structuredClone(profile));
    return this.get(profile.tenantId);
  }

  learn(tenantId: string, patch: TenantProfilePatch): TenantProfile {
    const current = this.get(tenantId);
    if (patch.uiPrefs) current.uiPrefs = { ...current.uiPrefs, ...patch.uiPrefs };
    if (patch.merchandisingStrategy) {
      current.merchandisingStrategy = { ...current.merchandisingStrategy, ...patch.merchandisingStrategy };
    }
    if (patch.marketingStrategy) {
      current.marketingStrategy = { ...current.marketingStrategy, ...patch.marketingStrategy };
    }
    if (patch.reportPrefs) current.reportPrefs = { ...current.reportPrefs, ...patch.reportPrefs };
    if (patch.memoryNote) current.memory.push(patch.memoryNote);
    return current;
  }
}
