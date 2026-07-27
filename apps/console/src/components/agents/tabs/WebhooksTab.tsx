"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Braces, Loader2, Save } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useAgentConfig, useSaveAgentConfig } from "@/src/hooks/queries/agents";
import { mergeConfig } from "@/src/lib/agents/config-defaults";
import {
  normalizeAgentVariables,
  uniqueDynamicVariableNames,
} from "@/src/lib/agents/dynamic-variables";
import {
  WebhookSecretFieldEditor,
  rowsForSecretFields,
  secretFieldRecordsEqual,
  secretFieldsFromRows,
  type SecretFieldRow,
} from "@/src/components/agents/WebhookSecretFieldEditor";

const schema = z
  .object({
    initiation_enabled: z.boolean(),
    initiation_url: z.string().url().or(z.literal("")),
    initiation_method: z.enum(["GET", "POST"]),
    post_enabled: z.boolean(),
    post_url: z.string().url().or(z.literal("")),
    post_transcript: z.boolean(),
    post_audio: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.initiation_enabled && !values.initiation_url.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Initiation webhook URL is required when enabled",
        path: ["initiation_url"],
      });
    }
    if (values.post_enabled && !values.post_url.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-call webhook URL is required when enabled",
        path: ["post_url"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;
type WebhookVariableRow = {
  id: string;
  key: string;
  value: string;
};

const webhookVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function variableToken(name: string) {
  return `{{${name}}}`;
}

function recordFromUnknown(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    record[key] = typeof entry === "string" ? entry : String(entry ?? "");
  }
  return record;
}

function rowsForVariables(
  variableNames: string[],
  value: unknown,
): WebhookVariableRow[] {
  const record = recordFromUnknown(value);
  return variableNames
    .filter((key) => webhookVariableNamePattern.test(key))
    .map((key) => ({
      id: key,
      key,
      value: record[key] ?? "",
    }));
}

function recordFromRows(rows: WebhookVariableRow[]) {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;
    record[key] = value;
  }
  return record;
}

function recordsEqual(a: Record<string, string>, b: Record<string, string>) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

export function WebhooksTab({ agentId }: { agentId: string }) {
  const { data: config, isLoading } = useAgentConfig(agentId);
  const save = useSaveAgentConfig(agentId);
  const [webhookRowsState, setWebhookRowsState] = useState({
    source: "",
    initiationVariableRows: [] as WebhookVariableRow[],
    initiationHeaderRows: [] as SecretFieldRow[],
    initiationBodyRows: [] as SecretFieldRow[],
    postHeaderRows: [] as SecretFieldRow[],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      initiation_enabled: false,
      initiation_url: "",
      initiation_method: "POST",
      post_enabled: false,
      post_url: "",
      post_transcript: true,
      post_audio: false,
    },
  });

  const agentVariables = useMemo(
    () => normalizeAgentVariables(config?.variables),
    [config?.variables],
  );
  const detectedVariableNames = useMemo(
    () => uniqueDynamicVariableNames(agentVariables),
    [agentVariables],
  );
  const savedWebhookRows = useMemo(() => {
    const init = config?.initiation_webhook;
    const post = config?.post_call_webhook;
    return {
      initiationVariableRows: rowsForVariables(
        detectedVariableNames,
        init?.dynamic_variables,
      ),
      initiationHeaderRows: rowsForSecretFields(init?.headers),
      initiationBodyRows: rowsForSecretFields(init?.body),
      postHeaderRows: rowsForSecretFields(post?.headers),
    };
  }, [
    config?.initiation_webhook,
    config?.post_call_webhook,
    detectedVariableNames,
  ]);
  const savedWebhookRowsSource = useMemo(
    () => JSON.stringify(savedWebhookRows),
    [savedWebhookRows],
  );

  if (webhookRowsState.source !== savedWebhookRowsSource) {
    setWebhookRowsState({
      source: savedWebhookRowsSource,
      ...savedWebhookRows,
    });
  }

  const currentWebhookRowsState =
    webhookRowsState.source === savedWebhookRowsSource
      ? webhookRowsState
      : { source: savedWebhookRowsSource, ...savedWebhookRows };
  const {
    initiationVariableRows,
    initiationHeaderRows,
    initiationBodyRows,
    postHeaderRows,
  } = currentWebhookRowsState;
  const setInitiationVariableRows = (
    rows:
      | WebhookVariableRow[]
      | ((currentRows: WebhookVariableRow[]) => WebhookVariableRow[]),
  ) =>
    setWebhookRowsState((state) => ({
      ...state,
      initiationVariableRows:
        typeof rows === "function" ? rows(state.initiationVariableRows) : rows,
    }));
  const setInitiationHeaderRows = (rows: SecretFieldRow[]) =>
    setWebhookRowsState((state) => ({ ...state, initiationHeaderRows: rows }));
  const setInitiationBodyRows = (rows: SecretFieldRow[]) =>
    setWebhookRowsState((state) => ({ ...state, initiationBodyRows: rows }));
  const setPostHeaderRows = (rows: SecretFieldRow[]) =>
    setWebhookRowsState((state) => ({ ...state, postHeaderRows: rows }));

  useEffect(() => {
    if (!config) return;
    const init = config.initiation_webhook;
    const post = config.post_call_webhook;
    form.reset({
      initiation_enabled: !!init,
      initiation_url: init?.webhook_url ?? "",
      initiation_method: (init?.method as "GET" | "POST") ?? "POST",
      post_enabled: !!post,
      post_url: post?.webhook_url ?? "",
      post_transcript: post?.transcript ?? true,
      post_audio: post?.audio_url ?? false,
    });
  }, [config, form]);

  const savedInitiationVariables = useMemo(
    () =>
      recordFromRows(
        rowsForVariables(
          detectedVariableNames,
          config?.initiation_webhook?.dynamic_variables,
        ),
      ),
    [config?.initiation_webhook?.dynamic_variables, detectedVariableNames],
  );
  const currentInitiationVariables = useMemo(
    () => recordFromRows(initiationVariableRows),
    [initiationVariableRows],
  );
  const initiationVariablesChanged = !recordsEqual(
    currentInitiationVariables,
    savedInitiationVariables,
  );
  const savedInitiationHeaders = useMemo(
    () =>
      secretFieldsFromRows(
        rowsForSecretFields(config?.initiation_webhook?.headers),
      ),
    [config?.initiation_webhook?.headers],
  );
  const currentInitiationHeaders = useMemo(
    () => secretFieldsFromRows(initiationHeaderRows),
    [initiationHeaderRows],
  );
  const savedInitiationBody = useMemo(
    () =>
      secretFieldsFromRows(
        rowsForSecretFields(config?.initiation_webhook?.body),
      ),
    [config?.initiation_webhook?.body],
  );
  const currentInitiationBody = useMemo(
    () => secretFieldsFromRows(initiationBodyRows),
    [initiationBodyRows],
  );
  const savedPostHeaders = useMemo(
    () =>
      secretFieldsFromRows(
        rowsForSecretFields(config?.post_call_webhook?.headers),
      ),
    [config?.post_call_webhook?.headers],
  );
  const currentPostHeaders = useMemo(
    () => secretFieldsFromRows(postHeaderRows),
    [postHeaderRows],
  );
  const webhookFieldsChanged =
    !secretFieldRecordsEqual(
      currentInitiationHeaders,
      savedInitiationHeaders,
    ) ||
    !secretFieldRecordsEqual(currentInitiationBody, savedInitiationBody) ||
    !secretFieldRecordsEqual(currentPostHeaders, savedPostHeaders);

  async function onSubmit(v: FormValues) {
    const dynamic_variables = recordFromRows(initiationVariableRows);
    const initiationHeaders = secretFieldsFromRows(initiationHeaderRows);
    const initiationBody = secretFieldsFromRows(initiationBodyRows);
    const postHeaders = secretFieldsFromRows(postHeaderRows);
    const shouldSendInitiationBody = v.initiation_method === "POST";
    const initiation_webhook = v.initiation_enabled
      ? {
          webhook_url: v.initiation_url,
          method: v.initiation_method,
          ...(Object.keys(initiationHeaders).length > 0
            ? { headers: initiationHeaders }
            : {}),
          ...(shouldSendInitiationBody && Object.keys(initiationBody).length > 0
            ? { body: initiationBody }
            : {}),
          ...(Object.keys(dynamic_variables).length > 0
            ? { dynamic_variables }
            : {}),
        }
      : null;
    const post_call_webhook = v.post_enabled
      ? {
          ...config?.post_call_webhook,
          webhook_url: v.post_url,
          method: "POST" as const,
          ...(Object.keys(postHeaders).length > 0
            ? { headers: postHeaders }
            : {}),
          transcript: v.post_transcript,
          audio_url: v.post_audio,
        }
      : null;
    await save.mutateAsync(
      mergeConfig(config, { initiation_webhook, post_call_webhook }),
    );
    form.reset(v);
    setInitiationVariableRows(
      rowsForVariables(detectedVariableNames, dynamic_variables),
    );
    setInitiationHeaderRows(rowsForSecretFields(initiationHeaders));
    setInitiationBodyRows(rowsForSecretFields(initiationBody));
    setPostHeaderRows(rowsForSecretFields(postHeaders));
  }

  const initiationOn = useWatch({
    control: form.control,
    name: "initiation_enabled",
  });
  const postOn = useWatch({
    control: form.control,
    name: "post_enabled",
  });
  const initiationMethod = useWatch({
    control: form.control,
    name: "initiation_method",
  });
  const canSave =
    form.formState.isDirty ||
    initiationVariablesChanged ||
    webhookFieldsChanged;

  function updateVariableRow(id: string, value: string) {
    setInitiationVariableRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, value } : row)),
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="border bg-card p-6">
          <div className="mb-5 flex items-start justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Initiation webhook</h2>
              <p className="text-sm text-muted-foreground">
                Called at the start of a real call to fetch dynamic variables
                and caller context.
              </p>
            </div>
            <FormField
              control={form.control}
              name="initiation_enabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <Label className="text-xs">Enabled</Label>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <FormField
              control={form.control}
              name="initiation_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://api.yourapp.com/webhooks/initiation"
                      disabled={!initiationOn}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="initiation_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Method</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!initiationOn}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <WebhookSecretFieldEditor
              label="Headers"
              description="Optional request headers used when fetching call context."
              rows={initiationHeaderRows}
              onChange={setInitiationHeaderRows}
              disabled={!initiationOn || save.isPending}
              keyPlaceholder="Header"
            />
            <WebhookSecretFieldEditor
              label="Body fields"
              description="Optional POST body fields sent so your endpoint can identify the call."
              rows={initiationBodyRows}
              onChange={setInitiationBodyRows}
              disabled={
                !initiationOn || initiationMethod === "GET" || save.isPending
              }
              keyPlaceholder="Field"
            />
          </div>

          <div className="mt-5 border border-dashed bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Braces className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Response variables</p>
                  <Badge variant="outline">
                    {detectedVariableNames.length} variable
                    {detectedVariableNames.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Map JSON paths from the webhook response into dynamic
                  variables used during the call.
                </p>
              </div>
            </div>

            {initiationVariableRows.length > 0 ? (
              <div className="mt-4 space-y-3">
                {initiationVariableRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
                  >
                    <div className="flex min-h-9 items-center border bg-background px-2.5 py-1 font-mono text-sm">
                      {variableToken(row.key)}
                    </div>
                    <Input
                      aria-label={`${variableToken(row.key)} JSON path`}
                      placeholder="customer.name"
                      value={row.value}
                      disabled={!initiationOn}
                      onChange={(event) =>
                        updateVariableRow(row.id, event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Add dynamic variables in the behavior prompt, then map each one
                to a JSON path from the webhook response.
              </p>
            )}
          </div>
        </section>

        <section className="border bg-card p-6">
          <div className="mb-5 flex items-start justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Post-call webhook</h2>
              <p className="text-sm text-muted-foreground">
                Called after the call completes, with transcripts and optional
                audio recording URL.
              </p>
            </div>
            <FormField
              control={form.control}
              name="post_enabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <Label className="text-xs">Enabled</Label>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="post_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://api.yourapp.com/webhooks/post-call"
                      disabled={!postOn}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <WebhookSecretFieldEditor
              label="Headers"
              description="Sent with the post-call webhook request."
              rows={postHeaderRows}
              onChange={setPostHeaderRows}
              disabled={!postOn || save.isPending}
              keyPlaceholder="Header"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="post_transcript"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between border p-4">
                    <div className="space-y-0.5">
                      <Label>Include transcript</Label>
                      <FormDescription>
                        Full transcript in payload.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!postOn}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="post_audio"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between border p-4">
                    <div className="space-y-0.5">
                      <Label>Include audio URL</Label>
                      <FormDescription>
                        Signed URL to the recording.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!postOn}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="submit"
            disabled={save.isPending || isLoading || !canSave}
          >
            {save.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save /> Save webhooks
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
