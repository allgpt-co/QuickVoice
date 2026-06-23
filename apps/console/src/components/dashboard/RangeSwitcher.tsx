"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/src/components/ui/toggle-group";
import type { DashboardRange } from "@/src/lib/api/resources/dashboard";

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function RangeSwitcher({
  current,
  loading = false,
}: {
  current: DashboardRange;
  loading?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const busy = loading || isPending;

  function onChange(value: string) {
    if (!value) return;
    const next = new URLSearchParams(params);
    next.set("range", value);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <ToggleGroup
        type="single"
        size="sm"
        value={current}
        onValueChange={onChange}
        aria-label="Dashboard date range"
        aria-busy={busy}
        className="w-full border bg-background p-1 sm:w-fit"
      >
        {RANGES.map((range) => (
          <ToggleGroupItem
            key={range.value}
            value={range.value}
            className="h-8 flex-1 px-3 text-xs font-semibold text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
          >
            {range.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {busy ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3 animate-spin" />
          Updating dashboard range
        </div>
      ) : null}
    </div>
  );
}
