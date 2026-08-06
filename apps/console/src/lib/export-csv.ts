export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadRowsAsCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
) {
  const csv = [
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => column.value(row))),
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

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
