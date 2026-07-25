import { AlertTriangle } from "lucide-react";

interface EvidenceStatusNoticeProps {
  title?: string;
  children: React.ReactNode;
}

export function EvidenceStatusNotice({
  title = "Evidence status",
  children,
}: EvidenceStatusNoticeProps) {
  return (
    <aside
      className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-5 text-left"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </aside>
  );
}
