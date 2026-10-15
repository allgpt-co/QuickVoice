"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { SecretSelect } from "@/src/components/secrets/SecretSelect";
import {
  normalizeFieldType,
  type SecretFieldRow,
} from "./webhook-secret-fields";

export {
  rowsForSecretFields,
  secretFieldsFromRows,
  secretFieldRecordsEqual,
} from "./webhook-secret-fields";
export type { SecretFieldRow, SecretFieldRecord, SecretFieldType } from "./webhook-secret-fields";

function createRow(): SecretFieldRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? [Date.now(), Math.random().toString(36).slice(2)].join("-"),
    key: "",
    value: "",
    type: "Value",
  };
}

export function WebhookSecretFieldEditor({
  label,
  description,
  rows,
  onChange,
  disabled,
  keyPlaceholder = "Key",
}: {
  label: string;
  description: string;
  rows: SecretFieldRow[];
  onChange: (rows: SecretFieldRow[]) => void;
  disabled?: boolean;
  keyPlaceholder?: string;
}) {
  function updateRow(id: string, patch: Partial<SecretFieldRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...rows, createRow()]);
  }

  function removeRow(id: string) {
    onChange(rows.filter((row) => row.id !== id));
  }

  return (
    <div className="border border-dashed bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Label>{label}</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {rows.length > 0 ? (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 lg:grid-cols-[minmax(0,180px)_140px_minmax(0,1fr)_36px]"
            >
              <Input
                aria-label={`${label} key`}
                placeholder={keyPlaceholder}
                value={row.key}
                disabled={disabled}
                onChange={(event) => updateRow(row.id, { key: event.target.value })}
              />
              <Select
                value={row.type}
                disabled={disabled}
                onValueChange={(value) =>
                  updateRow(row.id, { type: normalizeFieldType(value), value: "", redacted: false })
                }
              >
                <SelectTrigger aria-label={`${label} field type for ${row.key || "new field"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Value">Value</SelectItem>
                  <SelectItem value="Secret">Secret</SelectItem>
                </SelectContent>
              </Select>
              {row.type === "Secret" ? (
                <SecretSelect
                  value={row.value}
                  onValueChange={(value) => updateRow(row.id, { value, redacted: false })}
                  disabled={disabled}
                  placeholder={row.redacted ? "Saved secret" : "Select secret"}
                  ariaLabel={`${label} secret for ${row.key || "new field"}`}
                />
              ) : (
                <Input
                  aria-label={`${label} value`}
                  placeholder="Value"
                  value={row.value}
                  disabled={disabled}
                  onChange={(event) =>
                    updateRow(row.id, { value: event.target.value })
                  }
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label} row`}
                onClick={() => removeRow(row.id)}
                disabled={disabled}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No {label.toLowerCase()} configured.
        </p>
      )}
    </div>
  );
}
