"use client";

import { FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Eye, Table } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";

interface CSVPreviewProps {
  file: File | null;
  maxRows?: number;
  autoPreview?: boolean;
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  totalRows: number;
  errors: string[];
  warnings: string[];
}

function parseCSVContent(content: string, maxRows: number): ParsedCSV {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (content[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((entry) => entry.some((value) => value.length > 0));

  if (nonEmptyRows.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: ["The file appears to be empty"],
      warnings: [],
    };
  }

  const headers = nonEmptyRows[0]!.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  
  // Validate required columns
  if (!headers.includes("phone_number")) {
    errors.push("Missing required column: phone_number");
  }
  
  // Check for potential issues
  const displayRows = nonEmptyRows.slice(1, 1 + maxRows);
  
  // Check for missing phone numbers
  const phoneIndex = headers.indexOf("phone_number");
  if (phoneIndex >= 0) {
    let missingPhones = 0;
    displayRows.forEach((row) => {
      if (!row[phoneIndex]?.trim()) missingPhones += 1;
    });
    if (missingPhones > 0) {
      warnings.push(`${missingPhones} row(s) have missing phone numbers`);
    }
  }
  
  return {
    headers,
    rows: displayRows,
    totalRows: nonEmptyRows.length - 1, // Exclude header row
    errors,
    warnings,
  };
}

export function CSVPreview({
  file,
  maxRows = 10,
  autoPreview = true,
}: CSVPreviewProps) {
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(autoPreview);

  const handleParseFile = useCallback(async () => {
    if (!file) {
      setParsed(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith(".csv")) {
        setError("Preview only supports CSV files. XLSX files cannot be previewed.");
        setParsed(null);
        setIsLoading(false);
        return;
      }

      const content = await file.text();
      const cleanedContent = content.replace(/^\uFEFF/, ""); // Remove BOM
      const result = parseCSVContent(cleanedContent, maxRows);
      
      setParsed(result);
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
      setParsed(null);
    } finally {
      setIsLoading(false);
    }
  }, [file, maxRows]);

  // Auto-parse when file changes
  useEffect(() => {
    if (autoPreview && file) {
      handleParseFile();
    } else if (!file) {
      setParsed(null);
      setError(null);
      setShowPreview(false);
    }
  }, [file, autoPreview, handleParseFile]);

  if (!file) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center gap-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Parsing CSV...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Parse Error</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleParseFile}
        >
          <Eye className="size-4" />
          Preview
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Table className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">CSV Preview</p>
            <p className="text-xs text-muted-foreground">
              {parsed.totalRows} total rows • Showing {Math.min(parsed.rows.length, maxRows)} rows
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? "Hide" : "Show"}
        </Button>
      </div>

      {parsed.errors.length > 0 && (
        <div className="p-3 border-b bg-destructive/5">
          {parsed.errors.map((err, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <div className="p-3 border-b bg-amber-50">
          {parsed.warnings.map((warning, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="size-4 shrink-0" />
              {warning}
            </div>
          ))}
        </div>
      )}

      {showPreview && parsed.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  #
                </th>
                {parsed.headers.map((header, index) => (
                  <th
                    key={index}
                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {header}
                    {header === "phone_number" && (
                      <Badge variant="outline" className="ml-1.5 text-[10px]">
                        Required
                      </Badge>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {parsed.rows.slice(0, maxRows).map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">
                    {rowIndex + 2}
                  </td>
                  {parsed.headers.map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-2 max-w-[200px] truncate">
                      {row[colIndex] || (
                        <span className="text-muted-foreground italic">empty</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPreview && parsed.rows.length === 0 && (
        <div className="p-8 text-center">
          <FileSpreadsheet className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No data rows found in this file
          </p>
        </div>
      )}

      {parsed.errors.length === 0 && parsed.warnings.length === 0 && (
        <div className="p-3 border-t bg-emerald-50 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span className="text-sm text-emerald-700">
            File looks good! Ready to use for your campaign.
          </span>
        </div>
      )}
    </div>
  );
}