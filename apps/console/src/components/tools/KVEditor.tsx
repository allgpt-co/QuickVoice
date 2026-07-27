"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { SecretSelect } from "@/src/components/secrets/SecretSelect";
import type { KVPair } from "@/src/lib/api/types";

interface KVEditorProps {
  value: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
  disableAdd?: boolean;
  secretValues?: boolean;
}

export function KVEditor({
  value,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  disabled = false,
  disableAdd = false,
  secretValues = false,
}: KVEditorProps) {
  const update = (index: number, field: keyof KVPair, text: string) => {
    const next = value.map((pair, i) =>
      i === index
        ? {
            ...pair,
            [field]: text,
            ...(field === "value" ? { redacted: false } : {}),
          }
        : pair,
    );
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...value, { key: "", value: "", type: "Value" }]);
  };

  const updateType = (index: number, type: "Value" | "Secret") => {
    const next = value.map((pair, i) =>
      i === index ? { ...pair, type, value: "" } : pair,
    );
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.map((pair, index) => (
        <div
          key={index}
          className={
            secretValues
              ? "grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_36px]"
              : "grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]"
          }
        >
          <Input
            placeholder={keyPlaceholder}
            value={pair.key}
            onChange={(e) => update(index, "key", e.target.value)}
            disabled={disabled}
            className="h-9 font-mono text-xs"
          />
          {secretValues && (
            <Select
              value={pair.type ?? (pair.redacted ? "Secret" : "Value")}
              onValueChange={(type) =>
                updateType(index, type === "Secret" ? "Secret" : "Value")
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Value">Value</SelectItem>
                <SelectItem value="Secret">Secret</SelectItem>
              </SelectContent>
            </Select>
          )}
          {(pair.type ?? (pair.redacted ? "Secret" : "Value")) === "Secret" &&
          secretValues ? (
            <SecretSelect
              value={pair.value ?? ""}
              onValueChange={(selected) => update(index, "value", selected)}
              disabled={disabled}
            />
          ) : (
            <Input
              placeholder={
                pair.redacted ? "Saved secret value" : valuePlaceholder
              }
              value={pair.value ?? ""}
              onChange={(e) => update(index, "value", e.target.value)}
              disabled={disabled}
              className="h-9 font-mono text-xs"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => remove(index)}
            disabled={disabled}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {!disableAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={add}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          Add row
        </Button>
      )}
    </div>
  );
}
