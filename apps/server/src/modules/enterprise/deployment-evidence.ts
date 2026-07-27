export type ResidencyStatus = "supported" | "unsupported" | "unknown" | "customer_attested";
export type ComponentKind = "control_plane" | "media" | "database" | "object_storage" | "cache_queue" | "analytics" | "audit_logs" | "backup" | "external_provider";
export type DataClass = "audio" | "recording" | "transcript" | "metadata" | "contacts" | "secrets" | "analytics" | "evaluations" | "tool_payloads" | "backups";

export type ComponentInventory = {
  componentId: string;
  kind: ComponentKind;
  region?: string;
  status: ResidencyStatus;
  source: string;
  observedAt: string;
  dataClasses: DataClass[];
  encryptionProfileId?: string;
};

export type DeploymentProfile = {
  profileId: string;
  version: number;
  organizationId: string;
  requestedRegions: string[];
  components: ComponentInventory[];
};

type DeploymentProfileDrift =
  | { componentId: string; kind: "added" }
  | { componentId: string; kind: "changed"; changes: string[] };

export type BackupRun = {
  backupRunId: string;
  startedAt: string;
  completedAt?: string;
  encrypted: boolean;
  manifestChecksum?: string;
  coveredDataClasses: DataClass[];
  requiredDataClasses: DataClass[];
  integrityVerifiedAt?: string;
};

export type SliMeasurement = {
  sliId: string;
  target: number;
  observed: number;
  windowStart: string;
  windowEnd: string;
  dataGap: boolean;
  dependencyAttribution?: string;
};

export function validateDeploymentProfile(profile: DeploymentProfile) {
  const issues: string[] = [];
  if (profile.version < 1) issues.push("profile version must be positive");
  for (const component of profile.components) {
    if (component.status === "supported" && (!component.region || !profile.requestedRegions.includes(component.region))) issues.push(`${component.componentId} is outside requested regions`);
    if (component.status === "unknown") issues.push(`${component.componentId} residency is unknown`);
    if (component.dataClasses.includes("secrets") && !component.encryptionProfileId) issues.push(`${component.componentId} requires an encryption profile for secrets`);
  }
  return issues;
}

export function detectDeploymentProfileDrift(previous: DeploymentProfile, next: DeploymentProfile) {
  const previousById = new Map(previous.components.map((component) => [component.componentId, component]));
  return next.components.flatMap((component): DeploymentProfileDrift[] => {
    const previousComponent = previousById.get(component.componentId);
    if (!previousComponent) return [{ componentId: component.componentId, kind: "added" }];
    const changes: string[] = [];
    if (previousComponent.region !== component.region) changes.push("region");
    if (previousComponent.status !== component.status) changes.push("status");
    if (previousComponent.encryptionProfileId !== component.encryptionProfileId) changes.push("encryption");
    return changes.length > 0 ? [{ componentId: component.componentId, kind: "changed", changes }] : [];
  });
}

export function evaluateBackupRun(run: BackupRun) {
  const missingCoverage = run.requiredDataClasses.filter((dataClass) => !run.coveredDataClasses.includes(dataClass));
  const verified = Boolean(run.completedAt && run.encrypted && run.manifestChecksum && run.integrityVerifiedAt && missingCoverage.length === 0);
  return {
    status: verified ? "verified" as const : run.completedAt ? "incomplete" as const : "running" as const,
    missingCoverage,
    encrypted: run.encrypted,
    integrityVerified: Boolean(run.integrityVerifiedAt),
  };
}

export function evaluateSloMeasurement(measurement: SliMeasurement) {
  if (measurement.dataGap) return { status: "unknown" as const, reason: "data_gap" as const, burn: null };
  const burn = measurement.target === 1 ? 0 : (measurement.target - measurement.observed) / (1 - measurement.target);
  return {
    status: measurement.observed >= measurement.target ? "within_target" as const : "burning" as const,
    reason: measurement.observed >= measurement.target ? "target_met" as const : "target_missed" as const,
    burn: Math.round(burn * 10000) / 10000,
    dependencyAttribution: measurement.dependencyAttribution,
  };
}

export function buildRecoveryExerciseEvidence(args: { exerciseId: string; targetRtoMinutes: number; targetRpoMinutes: number; observedRtoMinutes: number; observedRpoMinutes: number; validationPassed: boolean; gaps: string[] }) {
  return {
    exerciseId: args.exerciseId,
    exercised: args.validationPassed,
    rtoStatus: args.observedRtoMinutes <= args.targetRtoMinutes ? "met" as const : "missed" as const,
    rpoStatus: args.observedRpoMinutes <= args.targetRpoMinutes ? "met" as const : "missed" as const,
    gaps: args.gaps,
  };
}
