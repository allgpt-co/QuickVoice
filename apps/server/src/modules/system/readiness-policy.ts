export type CheckStatus = "ok" | "error" | "not_configured";

export type ReadinessCheck = {
  status: CheckStatus;
  message?: string;
  required?: boolean;
};

export function evaluateReadiness(
  checks: Record<string, ReadinessCheck>,
  configuredRequired = ""
) {
  const requiredNames = new Set([
    "db",
    "redis",
    "auth",
    "internalApi",
    "secrets",
    ...configuredRequired
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  ]);
  const annotatedChecks = Object.fromEntries(
    Object.entries(checks).map(([name, check]) => [
      name,
      { ...check, required: requiredNames.has(name) },
    ])
  );
  const unknownRequired = [...requiredNames].filter(
    (name) => !Object.hasOwn(checks, name)
  );
  const ready =
    unknownRequired.length === 0 &&
    Object.values(annotatedChecks).every(
      (check) => !check.required || check.status === "ok"
    );

  return {
    ready,
    requiredIntegrations: [...requiredNames],
    unknownRequiredIntegrations: unknownRequired,
    checks: annotatedChecks,
  };
}
