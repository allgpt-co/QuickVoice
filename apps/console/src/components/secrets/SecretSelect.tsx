"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useSecrets } from "@/src/hooks/queries/secrets";

export function SecretSelect({
  value,
  onValueChange,
  disabled,
  placeholder = "Select secret",
  ariaLabel = "Select secret",
}: {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const { data: secrets = [], isLoading } = useSecrets();

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || isLoading || secrets.length === 0}
    >
      <SelectTrigger className="h-9" aria-label={ariaLabel}>
        <SelectValue
          placeholder={
            isLoading
              ? "Loading secrets..."
              : secrets.length === 0
                ? "No secrets saved"
                : placeholder
          }
        />
      </SelectTrigger>
      <SelectContent>
        {secrets.map((secret) => (
          <SelectItem key={secret.secretId} value={secret.reference}>
            {secret.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
