import {
  AlertTriangle,
  CircleAlert,
  Inbox,
  Loader2,
  ShieldAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  getApiErrorStateCopy,
  type ApiErrorStateCopyOptions,
} from "@/src/lib/api-error-state";
import { cn } from "@/src/lib/utils";

export type EmptyStateVariant =
  | "empty"
  | "error"
  | "permission"
  | "offline"
  | "warning";
export type StateKind = EmptyStateVariant | "loading";

type StateRole = "status" | "alert";
type StateLive = "polite" | "assertive";

type StateViewDefinition = {
  icon: LucideIcon;
  title: string;
  description: string;
  role: StateRole;
  live: StateLive;
  surfaceClassName: string;
  iconClassName: string;
  iconWrapperClassName: string;
};

const STATE_VIEW_COPY = {
  empty: {
    icon: Inbox,
    title: "Nothing here yet",
    description: "When data is available, it will appear here.",
    role: "status",
    live: "polite",
    surfaceClassName: "border-border bg-card",
    iconClassName: "text-muted-foreground",
    iconWrapperClassName: "bg-muted text-muted-foreground",
  },
  loading: {
    icon: Loader2,
    title: "Loading",
    description: "Fetching the latest workspace data.",
    role: "status",
    live: "polite",
    surfaceClassName: "border-border bg-card/40",
    iconClassName: "animate-spin text-primary motion-reduce:animate-none",
    iconWrapperClassName: "bg-primary/10 text-primary",
  },
  error: {
    icon: AlertTriangle,
    title: "Something went wrong",
    description: "Refresh the page or try again in a moment.",
    role: "alert",
    live: "assertive",
    surfaceClassName: "border-destructive/30 bg-destructive/5",
    iconClassName: "text-destructive",
    iconWrapperClassName: "bg-destructive/10 text-destructive",
  },
  permission: {
    icon: ShieldAlert,
    title: "Access required",
    description: "Ask a workspace admin for access to this area.",
    role: "alert",
    live: "assertive",
    surfaceClassName: "border-primary/30 bg-primary/5",
    iconClassName: "text-primary",
    iconWrapperClassName: "bg-primary/10 text-primary",
  },
  offline: {
    icon: WifiOff,
    title: "You are offline",
    description: "Reconnect to the internet to continue working in QuickVoice.",
    role: "alert",
    live: "assertive",
    surfaceClassName: "border-muted-foreground/30 bg-muted/40",
    iconClassName: "text-muted-foreground",
    iconWrapperClassName: "bg-muted text-muted-foreground",
  },
  warning: {
    icon: CircleAlert,
    title: "Review before continuing",
    description: "Check this workspace state before taking the next step.",
    role: "alert",
    live: "assertive",
    surfaceClassName: "border-warning/30 bg-warning/10",
    iconClassName: "text-warning",
    iconWrapperClassName: "bg-warning/10 text-warning",
  },
} satisfies Record<StateKind, StateViewDefinition>;

export type StateViewProps = {
  kind: StateKind;
  icon?: LucideIcon;
  title?: string;
  description?: string | null;
  action?: ReactNode;
  recommendedAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
};

export function StateView({
  kind,
  icon,
  title,
  description,
  action,
  recommendedAction,
  secondaryAction,
  className,
}: StateViewProps) {
  const state = STATE_VIEW_COPY[kind];
  const Icon = icon ?? state.icon;
  const resolvedDescription =
    description === undefined ? state.description : description;
  const primaryAction = recommendedAction ?? action;

  return (
    <div
      role={state.role}
      aria-live={state.live}
      aria-busy={kind === "loading" ? true : undefined}
      className={cn(
        "flex flex-col items-center justify-center border border-dashed px-6 py-14 text-center",
        state.surfaceClassName,
        className
      )}
    >
      <div
        className={cn(
          "mb-4 flex size-14 items-center justify-center",
          state.iconWrapperClassName
        )}
      >
        <Icon
          className={cn("size-7", state.iconClassName)}
          aria-hidden="true"
        />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {title ?? state.title}
      </h3>
      {resolvedDescription ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {resolvedDescription}
        </p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex w-full flex-col items-center justify-center gap-2 sm:w-auto sm:flex-row">
          {primaryAction ? (
            <div className="w-full sm:w-auto">{primaryAction}</div>
          ) : null}
          {secondaryAction ? (
            <div className="w-full sm:w-auto">{secondaryAction}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  kind,
  variant,
  title,
  description,
  action,
  recommendedAction,
  secondaryAction,
  className,
}: {
  icon?: LucideIcon;
  kind?: EmptyStateVariant;
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  recommendedAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <StateView
      kind={variant ?? kind ?? "empty"}
      icon={Icon}
      title={title}
      description={description ?? null}
      action={action}
      recommendedAction={recommendedAction}
      secondaryAction={secondaryAction}
      className={className}
    />
  );
}

type PresetStateProps = Omit<StateViewProps, "kind">;

export function LoadingState(props: PresetStateProps) {
  return <StateView kind="loading" {...props} />;
}

export function ErrorState(props: PresetStateProps) {
  return <StateView kind="error" {...props} />;
}

export function PermissionState(props: PresetStateProps) {
  return <StateView kind="permission" {...props} />;
}

export function OfflineState(props: PresetStateProps) {
  return <StateView kind="offline" {...props} />;
}

export function WarningState(props: PresetStateProps) {
  return <StateView kind="warning" {...props} />;
}

export type ApiErrorStateProps = Omit<
  StateViewProps,
  "kind" | "title" | "description"
> &
  ApiErrorStateCopyOptions & {
    error: unknown;
    title?: string;
    description?: string | null;
  };

export function ApiErrorState({
  error,
  resourceName,
  isOnline,
  overrides,
  title,
  description,
  ...props
}: ApiErrorStateProps) {
  const state = getApiErrorStateCopy(error, {
    resourceName,
    isOnline,
    overrides,
  });

  return (
    <StateView
      kind={state.kind}
      title={title ?? state.title}
      description={description === undefined ? state.description : description}
      {...props}
    />
  );
}
