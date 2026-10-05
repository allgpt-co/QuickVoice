"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Globe2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
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
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import type {
  AgentWidget,
  AgentWidgetLauncherSize,
  AgentWidgetPosition,
  AgentWidgetTheme,
} from "@/src/lib/api/types";
import {
  useAgentWidgets,
  useCreateAgentWidget,
  useDeleteAgentWidget,
  useUpdateAgentWidget,
} from "@/src/hooks/queries/widgets";

type WidgetForm = {
  name: string;
  enabled: boolean;
  allowedOriginsText: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  buttonTextColor: string;
  borderColor: string;
  position: AgentWidgetPosition;
  launcherSize: AgentWidgetLauncherSize;
  panelWidth: number;
  borderRadius: number;
  defaultOpen: boolean;
  showAvatar: boolean;
  avatarImageUrl: string;
  avatarOrbColor1: string;
  avatarOrbColor2: string;
  brandName: string;
  actionText: string;
  welcomeText: string;
  startButtonText: string;
  endButtonText: string;
  connectingText: string;
  listeningText: string;
  speakingText: string;
  endedText: string;
  whiteLabel: boolean;
  consentRequired: boolean;
  consentText: string;
};

const DEFAULT_THEME: AgentWidgetTheme = {
  primaryColor: "#002FA7",
  accentColor: "#0F172A",
  surfaceColor: "#FFFFFF",
  textColor: "#111827",
  mutedTextColor: "#667085",
  buttonTextColor: "#FFFFFF",
  borderColor: "#DADDE3",
  position: "bottom-right",
  launcherSize: "comfortable",
  panelWidth: 340,
  borderRadius: 16,
  defaultOpen: false,
  showAvatar: true,
  avatarImageUrl: null,
  avatarOrbColor1: "#002FA7",
  avatarOrbColor2: "#00F0FF",
  brandName: "QuickVoice",
  actionText: "Talk to us",
  welcomeText: "Talk with our voice agent.",
  startButtonText: "Start call",
  endButtonText: "End call",
  connectingText: "Connecting",
  listeningText: "Listening",
  speakingText: "Assistant speaking",
  endedText: "Call ended",
  whiteLabel: false,
};

const DEFAULT_FORM: WidgetForm = {
  name: "Website widget",
  enabled: false,
  allowedOriginsText: "",
  ...DEFAULT_THEME,
  avatarImageUrl: "",
  consentRequired: true,
  consentText: "This voice call may be recorded and transcribed.",
};

export function WebsiteWidgetTab({ agentId }: { agentId: string }) {
  const { data: widgets = [], isLoading } = useAgentWidgets(agentId);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedWidget = useMemo(
    () =>
      creating
        ? null
        : widgets.find((widget) => widget.widgetId === selectedWidgetId) ??
          widgets[0] ??
          null,
    [creating, selectedWidgetId, widgets],
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Website widgets
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Create an embeddable voice entry point for this agent.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedWidgetId(null);
                setCreating(true);
              }}
            >
              <Plus className="size-4" /> New
            </Button>
          </div>
        </div>
        <div className="divide-y">
          {widgets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No widgets have been created for this agent.
            </div>
          ) : (
            widgets.map((widget) => (
              <button
                key={widget.widgetId}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedWidgetId(widget.widgetId);
                }}
                className={`block w-full px-4 py-3 text-left transition hover:bg-muted/40 ${
                  selectedWidget?.widgetId === widget.widgetId ? "bg-muted/50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {widget.name}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {widget.widgetId}
                    </p>
                  </div>
                  <Badge variant={widget.enabled ? "default" : "secondary"}>
                    {widget.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <WidgetEditor
        key={selectedWidget?.widgetId ?? "new-widget"}
        agentId={agentId}
        widget={selectedWidget}
        onCreated={(widget) => {
          setCreating(false);
          setSelectedWidgetId(widget.widgetId);
        }}
        onDeleted={() => {
          setCreating(false);
          setSelectedWidgetId(null);
        }}
      />
    </div>
  );
}

function WidgetEditor({
  agentId,
  widget,
  onCreated,
  onDeleted,
}: {
  agentId: string;
  widget: AgentWidget | null;
  onCreated: (widget: AgentWidget) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<WidgetForm>(
    () => (widget ? formFromWidget(widget) : DEFAULT_FORM),
  );
  const [copied, setCopied] = useState(false);
  const createWidget = useCreateAgentWidget(agentId);
  const updateWidget = useUpdateAgentWidget(agentId, widget?.widgetId ?? "");
  const deleteWidget = useDeleteAgentWidget(agentId);
  const isSaving = createWidget.isPending || updateWidget.isPending;

  async function saveWidget() {
    try {
      const payload = formToPayload(form);
      if (widget) {
        await updateWidget.mutateAsync(payload);
        return;
      }
      const created = await createWidget.mutateAsync(payload);
      onCreated(created);
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  async function copySnippet() {
    if (!widget) return;
    await navigator.clipboard.writeText(widget.embed.snippet);
    setCopied(true);
    toast.success("Embed snippet copied");
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function removeWidget() {
    try {
      if (!widget) return;
      if (!window.confirm(`Delete ${widget.name}? Embedded sites will stop loading this widget.`)) {
        return;
      }
      await deleteWidget.mutateAsync(widget.widgetId);
      onDeleted();
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  return (
    <div className="space-y-4">
      <div className="border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {widget ? "Widget settings" : "Create widget"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Customize the embedded voice widget, then allow exact website origins.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {widget ? (
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteWidget.isPending}
                onClick={removeWidget}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : null}
            <Button disabled={isSaving} onClick={saveWidget}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {widget ? "Save widget" : "Create widget"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="space-y-4 border bg-background p-4">
              <SectionTitle
                title="Publishing"
                description="Control availability and the websites allowed to start calls."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Widget name">
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </Field>
                <div className="flex items-center justify-between border bg-card px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium">Enabled</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Allow approved websites to start calls.
                    </p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) =>
                      setForm((current) => ({ ...current, enabled }))
                    }
                  />
                </div>
              </div>

              <Field label="Allowed origins">
                <Textarea
                  className="min-h-24 font-mono text-sm"
                  value={form.allowedOriginsText}
                  placeholder={"https://example.com\nhttps://www.example.com"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      allowedOriginsText: event.target.value,
                    }))
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter one exact origin per line. Paths, query strings, credentials,
                  and wildcards are rejected.
                </p>
              </Field>
            </section>

            <section className="space-y-4 border bg-background p-4">
              <SectionTitle
                title="Brand and whitelabeling"
                description="Set the visible brand, avatar, and whether QuickVoice branding appears."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand name">
                  <Input
                    value={form.brandName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        brandName: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Avatar image URL">
                  <Input
                    value={form.avatarImageUrl}
                    placeholder="https://cdn.example.com/logo.png"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        avatarImageUrl: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between border bg-card px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium">Show avatar</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Display an image or gradient orb in the widget header.
                    </p>
                  </div>
                  <Switch
                    checked={form.showAvatar}
                    onCheckedChange={(showAvatar) =>
                      setForm((current) => ({ ...current, showAvatar }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between border bg-card px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium">Whitelabel widget</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hide “Powered by QuickVoice” from the embed.
                    </p>
                  </div>
                  <Switch
                    checked={form.whiteLabel}
                    onCheckedChange={(whiteLabel) =>
                      setForm((current) => ({ ...current, whiteLabel }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  label="Avatar orb color 1"
                  value={form.avatarOrbColor1}
                  onChange={(avatarOrbColor1) =>
                    setForm((current) => ({ ...current, avatarOrbColor1 }))
                  }
                />
                <ColorField
                  label="Avatar orb color 2"
                  value={form.avatarOrbColor2}
                  onChange={(avatarOrbColor2) =>
                    setForm((current) => ({ ...current, avatarOrbColor2 }))
                  }
                />
              </div>
            </section>

            <section className="space-y-4 border bg-background p-4">
              <SectionTitle
                title="Appearance"
                description="Match the launcher, panel, and controls to the customer site."
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <ColorField
                  label="Primary color"
                  value={form.primaryColor}
                  onChange={(primaryColor) =>
                    setForm((current) => ({ ...current, primaryColor }))
                  }
                />
                <ColorField
                  label="Accent color"
                  value={form.accentColor}
                  onChange={(accentColor) =>
                    setForm((current) => ({ ...current, accentColor }))
                  }
                />
                <ColorField
                  label="Button text color"
                  value={form.buttonTextColor}
                  onChange={(buttonTextColor) =>
                    setForm((current) => ({ ...current, buttonTextColor }))
                  }
                />
                <ColorField
                  label="Surface color"
                  value={form.surfaceColor}
                  onChange={(surfaceColor) =>
                    setForm((current) => ({ ...current, surfaceColor }))
                  }
                />
                <ColorField
                  label="Text color"
                  value={form.textColor}
                  onChange={(textColor) =>
                    setForm((current) => ({ ...current, textColor }))
                  }
                />
                <ColorField
                  label="Muted text color"
                  value={form.mutedTextColor}
                  onChange={(mutedTextColor) =>
                    setForm((current) => ({ ...current, mutedTextColor }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ColorField
                  label="Border color"
                  value={form.borderColor}
                  onChange={(borderColor) =>
                    setForm((current) => ({ ...current, borderColor }))
                  }
                />
                <NumberField
                  label="Panel width"
                  value={form.panelWidth}
                  min={280}
                  max={420}
                  onChange={(panelWidth) =>
                    setForm((current) => ({ ...current, panelWidth }))
                  }
                />
                <NumberField
                  label="Corner radius"
                  value={form.borderRadius}
                  min={0}
                  max={32}
                  onChange={(borderRadius) =>
                    setForm((current) => ({ ...current, borderRadius }))
                  }
                />
                <Field label="Launcher size">
                  <Select
                    value={form.launcherSize}
                    onValueChange={(launcherSize: AgentWidgetLauncherSize) =>
                      setForm((current) => ({ ...current, launcherSize }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Position">
                  <Select
                    value={form.position}
                    onValueChange={(position: AgentWidgetPosition) =>
                      setForm((current) => ({ ...current, position }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom-right">Bottom right</SelectItem>
                      <SelectItem value="bottom-left">Bottom left</SelectItem>
                      <SelectItem value="top-right">Top right</SelectItem>
                      <SelectItem value="top-left">Top left</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between border bg-card px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium">Open by default</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Show the panel expanded when the page loads.
                    </p>
                  </div>
                  <Switch
                    checked={form.defaultOpen}
                    onCheckedChange={(defaultOpen) =>
                      setForm((current) => ({ ...current, defaultOpen }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 border bg-background p-4">
              <SectionTitle
                title="Display text"
                description="Customize launcher copy, call controls, and status messages."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Launcher text">
                  <Input
                    value={form.actionText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        actionText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Start button text">
                  <Input
                    value={form.startButtonText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startButtonText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="End button text">
                  <Input
                    value={form.endButtonText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endButtonText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Connecting text">
                  <Input
                    value={form.connectingText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        connectingText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Listening text">
                  <Input
                    value={form.listeningText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        listeningText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Speaking text">
                  <Input
                    value={form.speakingText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        speakingText: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Ended text">
                  <Input
                    value={form.endedText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endedText: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Welcome text">
                <Textarea
                  value={form.welcomeText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      welcomeText: event.target.value,
                    }))
                  }
                />
              </Field>
            </section>

            <section className="space-y-4 border bg-background p-4">
              <SectionTitle
                title="Terms"
                description="Control the consent notice shown before microphone access."
              />
              <div className="flex items-center justify-between border bg-card px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">Consent required</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Show consent copy before connecting.
                  </p>
                </div>
                <Switch
                  checked={form.consentRequired}
                  onCheckedChange={(consentRequired) =>
                    setForm((current) => ({ ...current, consentRequired }))
                  }
                />
              </div>
              <Field label="Consent text">
                <Textarea
                  value={form.consentText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      consentText: event.target.value,
                    }))
                  }
                />
              </Field>
            </section>
          </div>

          <div className="space-y-4">
            <WidgetPreview form={form} />

            <div className="border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Embed snippet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste this before the closing body tag.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!widget}
                  onClick={copySnippet}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  Copy
                </Button>
              </div>
              <pre className="mt-3 overflow-x-auto border bg-card p-3 text-xs text-muted-foreground">
                <code>
                  {widget
                    ? widget.embed.snippet
                    : "Create the widget to generate an embed snippet."}
                </code>
              </pre>
              <p className="mt-3 text-xs text-muted-foreground">
                Optional HTML attributes can override visual text and colors per embed;
                server-side whitelabeling and allowlists stay controlled here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          className="h-10 w-14 p-1"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          className="font-mono text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function WidgetPreview({ form }: { form: WidgetForm }) {
  const radius = `${form.borderRadius}px`;
  const avatar = form.avatarImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="size-10 rounded-full object-cover"
      src={form.avatarImageUrl}
    />
  ) : (
    <div
      className="size-10 rounded-full"
      style={{
        background: `linear-gradient(135deg, ${form.avatarOrbColor1}, ${form.avatarOrbColor2})`,
      }}
    />
  );

  return (
    <div className="border bg-background p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Globe2 className="size-4" /> Widget preview
      </div>
      <div className="flex min-h-72 items-end justify-end bg-muted/40 p-4">
        <div className="w-full max-w-[300px] space-y-3">
          <div
            className="border shadow-sm"
            style={{
              backgroundColor: form.surfaceColor,
              borderColor: form.borderColor,
              borderRadius: radius,
              color: form.textColor,
            }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: form.borderColor }}
            >
              <div className="flex items-center gap-3">
                {form.showAvatar ? avatar : null}
                <div>
                  <p className="text-sm font-semibold">{form.brandName}</p>
                  <p className="text-xs" style={{ color: form.mutedTextColor }}>
                    {form.listeningText}
                  </p>
                </div>
              </div>
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: form.primaryColor }}
              />
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm">{form.welcomeText}</p>
              {form.consentRequired ? (
                <p
                  className="border-l-2 pl-3 text-xs"
                  style={{ borderColor: form.primaryColor, color: form.mutedTextColor }}
                >
                  {form.consentText}
                </p>
              ) : null}
              <Button
                className="w-full"
                style={{
                  backgroundColor: form.primaryColor,
                  borderRadius: `${Math.max(form.borderRadius - 6, 0)}px`,
                  color: form.buttonTextColor,
                }}
              >
                {form.startButtonText}
              </Button>
              {!form.whiteLabel ? (
                <p className="text-center text-[11px]" style={{ color: form.mutedTextColor }}>
                  Powered by QuickVoice
                </p>
              ) : null}
            </div>
          </div>
          <button
            className="w-full border px-4 py-3 text-sm font-semibold shadow-sm"
            style={{
              backgroundColor: form.primaryColor,
              borderColor: form.primaryColor,
              borderRadius: radius,
              color: form.buttonTextColor,
            }}
            type="button"
          >
            {form.actionText}
          </button>
        </div>
      </div>
    </div>
  );
}

function formFromWidget(widget: AgentWidget): WidgetForm {
  const theme = themeWithDefaults(widget.theme);
  return {
    name: widget.name,
    enabled: widget.enabled,
    allowedOriginsText: widget.allowedOrigins.join("\n"),
    ...theme,
    avatarImageUrl: theme.avatarImageUrl ?? "",
    consentRequired: widget.consentRequired,
    consentText: widget.consentText,
  };
}

function formToPayload(form: WidgetForm) {
  return {
    name: form.name.trim(),
    enabled: form.enabled,
    allowedOrigins: form.allowedOriginsText
      .split(/\n|,/)
      .map((origin) => origin.trim())
      .filter(Boolean),
    theme: {
      primaryColor: form.primaryColor,
      accentColor: form.accentColor,
      surfaceColor: form.surfaceColor,
      textColor: form.textColor,
      mutedTextColor: form.mutedTextColor,
      buttonTextColor: form.buttonTextColor,
      borderColor: form.borderColor,
      position: form.position,
      launcherSize: form.launcherSize,
      panelWidth: clampNumber(form.panelWidth, 280, 420),
      borderRadius: clampNumber(form.borderRadius, 0, 32),
      defaultOpen: form.defaultOpen,
      showAvatar: form.showAvatar,
      avatarImageUrl: form.avatarImageUrl.trim() || null,
      avatarOrbColor1: form.avatarOrbColor1,
      avatarOrbColor2: form.avatarOrbColor2,
      brandName: form.brandName.trim(),
      actionText: form.actionText.trim(),
      welcomeText: form.welcomeText.trim(),
      startButtonText: form.startButtonText.trim(),
      endButtonText: form.endButtonText.trim(),
      connectingText: form.connectingText.trim(),
      listeningText: form.listeningText.trim(),
      speakingText: form.speakingText.trim(),
      endedText: form.endedText.trim(),
      whiteLabel: form.whiteLabel,
    },
    consentRequired: form.consentRequired,
    consentText: form.consentText.trim(),
  };
}

function themeWithDefaults(theme: Partial<AgentWidgetTheme>): AgentWidgetTheme {
  return { ...DEFAULT_THEME, ...theme };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}
