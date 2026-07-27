export type CallDateFilterInput = {
  from?: string | null;
  range?: string | null;
  to?: string | null;
};

const RANGE_MILLISECONDS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export function resolveCallDateFilters(
  input: CallDateFilterInput,
  now = new Date(),
) {
  const from = parseCalendarBoundary(input.from, "start");
  const to = parseCalendarBoundary(input.to, "end");
  if (from || to) {
    return {
      from: from?.toISOString(),
      to: to?.toISOString(),
    };
  }

  const duration = input.range
    ? RANGE_MILLISECONDS[input.range]
    : undefined;
  if (!duration) return {};

  return {
    from: new Date(now.getTime() - duration).toISOString(),
    to: now.toISOString(),
  };
}

function parseCalendarBoundary(
  value: string | null | undefined,
  boundary: "start" | "end",
) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date =
    boundary === "start"
      ? new Date(year, month, day, 0, 0, 0, 0)
      : new Date(year, month, day, 23, 59, 59, 999);

  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null;
}
