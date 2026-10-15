export type SecretFieldType = "Value" | "Secret";

export type SecretFieldRecord = Record<
  string,
  { value: string | null; type: SecretFieldType; redacted?: boolean }
>;

export type SecretFieldRow = {
  id: string;
  key: string;
  value: string;
  type: SecretFieldType;
  redacted?: boolean;
};

function normalizeFieldType(value: unknown): SecretFieldType {
  return value === "Secret" ? "Secret" : "Value";
}

export function rowsForSecretFields(value: unknown): SecretFieldRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>).map(([key, entry], index) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      return {
        id: `${key}-${index}`,
        key,
        value: typeof record.value === "string" ? record.value : String(record.value ?? ""),
        type: normalizeFieldType(record.type),
        redacted: record.redacted === true,
      };
    }

    return {
      id: `${key}-${index}`,
      key,
      value: typeof entry === "string" ? entry : String(entry ?? ""),
      type: "Value",
    };
  });
}

export function secretFieldsFromRows(rows: SecretFieldRow[]): SecretFieldRecord {
  const record: SecretFieldRecord = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || (!value && !row.redacted)) continue;
    record[key] = row.redacted && row.type === "Secret" && !value
      ? { value: null, type: "Secret", redacted: true }
      : { value, type: row.type };
  }
  return record;
}

export function secretFieldRecordsEqual(
  a: SecretFieldRecord,
  b: SecretFieldRecord
) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => {
    const otherKey = bKeys[index];
    return (
      key === otherKey &&
      a[key]?.value === b[otherKey]?.value &&
      a[key]?.type === b[otherKey]?.type &&
      !!a[key]?.redacted === !!b[otherKey]?.redacted
    );
  });
}

export { normalizeFieldType };
