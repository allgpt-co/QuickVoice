export function QuickVoiceLogo({
  label = "QuickVoice",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[var(--qv-ink)]">
      <span className="grid size-8 shrink-0 place-items-center text-[var(--qv-ink)]">
        <svg
          aria-hidden="true"
          className="size-8"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="geometricPrecision"
        >
          <g transform="rotate(-12 32 32)">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
            />
            <rect x="18" y="26" width="6" height="12" rx="3" fill="currentColor" />
            <rect x="26" y="20" width="6" height="24" rx="3" fill="currentColor" />
            <rect x="34" y="20" width="6" height="24" rx="3" fill="currentColor" />
            <rect x="42" y="26" width="6" height="12" rx="3" fill="currentColor" />
          </g>
        </svg>
      </span>
      <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
    </span>
  );
}
