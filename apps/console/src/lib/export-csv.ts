export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  // Plain signed integers and decimals are numeric literals, not executable formulas.
  // Keep the leading + intact for CRM imports; expressions still get escaped.
  const isNumber = /^[+-]?\d+(\.\d+)?$/.test(text);
  const safeText =
    typeof value === "string" && !isNumber && /^[=+\-@\t\r\n]/.test(text)
      ? `'${text}`
      : text;
  return /[",\n\r]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText;
}

export function serializeCsvRows(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadRowsAsCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
) {
  const csv = serializeCsvRows([
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => column.value(row))),
  ]);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadBlobAsFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
