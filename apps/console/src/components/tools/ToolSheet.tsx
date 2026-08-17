"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Bot, Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/src/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { KVEditor } from "@/src/components/tools/KVEditor";
import { ParamEditor } from "@/src/components/tools/ParamEditor";
import {
  useCreateTool,
  useUpdateTool,
  useAttachAgentToTool,
  useDetachAgentFromTool,
} from "@/src/hooks/queries/tools";
import { useAgents } from "@/src/hooks/queries/agents";
import type { Tool, KVPair, ToolParam } from "@/src/lib/api/types";

const kvPair = z.object({
  key: z.string().trim().min(1, "Key is required"),
  value: z.string().nullable(),
  type: z.enum(["Value", "Secret"]).optional(),
  redacted: z.boolean().optional(),
});

const toolParam = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["String", "Number", "Boolean"]),
  valueType: z.enum(["LLM Prompt", "Static Value", "Dynamic Variable"]),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .optional()
    .nullable(),
  description: z.string(),
  allowedValues: z.array(z.string()),
  required: z.boolean(),
});

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  api_url: z.string().url("Must be a valid URL"),
  api_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  api_headers: z.array(kvPair),
  api_query_params: z.array(toolParam),
  api_path_params: z.array(toolParam),
  api_body: z.array(toolParam),
  dynamic_variables: z.array(kvPair),
  response_timeout_secs: z.coerce
    .number()
    .int()
    .min(1)
    .max(300)
    .optional()
    .or(z.literal("")),
  disable_interruptions: z.boolean(),
  force_pre_tool_speech: z.boolean(),
});

type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

const EMPTY_PARAM: ToolParam = {
  name: "",
  type: "String",
  valueType: "LLM Prompt",
  description: "",
  allowedValues: [],
  required: false,
  value: null,
};

const DEFAULT_VALUES: FormInput = {
  name: "",
  description: "",
  api_url: "",
  api_method: "POST",
  api_headers: [],
  api_query_params: [],
  api_path_params: [],
  api_body: [],
  dynamic_variables: [],
  response_timeout_secs: "",
  disable_interruptions: false,
  force_pre_tool_speech: true,
};

function toFormValues(tool: Tool): FormInput {
  return {
    name: tool.name,
    description: tool.description,
    api_url: tool.api_url,
    api_method: tool.api_method as FormValues["api_method"],
    api_headers: (tool.api_headers ?? []).map((pair) => ({
      ...pair,
      value: pair.value ?? "",
    })),
    api_query_params: (tool.api_query_params ?? []) as ToolParam[],
    api_path_params: (tool.api_path_params ?? []) as ToolParam[],
    api_body: (tool.api_body ?? []) as ToolParam[],
    dynamic_variables: (tool.dynamic_variables ?? []).map((pair) => ({
      ...pair,
      value: pair.value ?? "",
    })),
    response_timeout_secs: tool.response_timeout_secs ?? "",
    disable_interruptions: tool.disable_interruptions,
    force_pre_tool_speech: tool.force_pre_tool_speech,
  };
}

function LinkedAgentsSection({
  toolId,
  linkedAgents,
}: {
  toolId: string;
  linkedAgents: { agentId: string; name: string }[];
}) {
  const { data: allAgents = [], isLoading } = useAgents();
  const attach = useAttachAgentToTool(toolId);
  const detach = useDetachAgentFromTool(toolId);
  const linkedIds = new Set(linkedAgents.map((a) => a.agentId));

  const toggle = (agentId: string) => {
    if (linkedIds.has(agentId)) {
      detach.mutate(agentId);
    } else {
      attach.mutate(agentId);
    }
  };

  const isPendingFor = (agentId: string) =>
    (attach.isPending && attach.variables === agentId) ||
    (detach.isPending && detach.variables === agentId);

  return (
    <div className="space-y-3 px-6 py-5">
      <Separator />
      <div className="pt-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Linked Agents
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          Agents that can invoke this tool mid-conversation.
        </p>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading agents…</p>
      ) : !allAgents.length ? (
        <p className="text-xs text-muted-foreground">
          No agents in this organization yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {allAgents.map((agent) => {
            const linked = linkedIds.has(agent.agentId);
            const pending = isPendingFor(agent.agentId);
            return (
              <div
                key={agent.agentId}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded border bg-primary/10 text-primary">
                    <Bot className="size-3.5" />
                  </div>
                  <span className="text-sm font-medium">{agent.name}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={linked ? "outline" : "default"}
                  className="h-7 text-xs"
                  onClick={() => toggle(agent.agentId)}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : linked ? (
                    <>
                      <Check className="size-3" /> Linked
                    </>
                  ) : (
                    <>
                      <Plus className="size-3" /> Link
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function cleanKvPairs(pairs: KVPair[]) {
  return pairs
    .map((pair) => ({
      ...pair,
      key: pair.key.trim(),
      value: pair.value == null ? "" : String(pair.value).trim(),
      type: pair.type ?? "Value",
    }))
    .filter((pair) => pair.key && pair.value);
}

interface ToolSheetProps {
  mode: "create" | "edit";
  tool?: Tool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ToolSheet({ mode, tool, open, onOpenChange }: ToolSheetProps) {
  const createTool = useCreateTool();
  const updateTool = useUpdateTool(tool?.toolId ?? "");

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const urlValue = useWatch({ control, name: "api_url" });

  useEffect(() => {
    const matches = [...(urlValue ?? "").matchAll(/\{(\w+)\}/g)].map(
      (m) => m[1],
    );
    if (!matches.length) return;
    const current = getValues("api_path_params") ?? [];
    const currentMap = new Map(current.map((p) => [p.name, p]));
    const next = matches.map(
      (name) => currentMap.get(name) ?? { ...EMPTY_PARAM, name },
    );
    const unchanged =
      next.length === current.length &&
      next.every((p, i) => p.name === current[i]?.name);
    if (!unchanged) setValue("api_path_params", next);
  }, [urlValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      reset(mode === "edit" && tool ? toFormValues(tool) : DEFAULT_VALUES);
    }
  }, [open, mode, tool, reset]);

  const isPending = createTool.isPending || updateTool.isPending;

  const onSubmit = async (values: FormValues) => {
    const apiHeaders = cleanKvPairs(values.api_headers as KVPair[]);
    const dynamicVariables = cleanKvPairs(values.dynamic_variables as KVPair[]);
    const payload = {
      ...values,
      response_timeout_secs:
        values.response_timeout_secs === ""
          ? null
          : Number(values.response_timeout_secs),
      api_headers: apiHeaders.length ? apiHeaders : null,
      api_query_params: values.api_query_params.length
        ? values.api_query_params
        : null,
      api_path_params: values.api_path_params.length
        ? values.api_path_params
        : null,
      api_body: values.api_body.length ? values.api_body : null,
      dynamic_variables: dynamicVariables.length ? dynamicVariables : null,
    };

    if (mode === "create") {
      await createTool.mutateAsync(payload, {
        onSuccess: () => {
          toast.success("Tool created");
          onOpenChange(false);
        },
      });
    } else {
      await updateTool.mutateAsync(payload, {
        onSuccess: () => {
          toast.success("Tool saved");
          onOpenChange(false);
        },
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>
            {mode === "create" ? "New tool" : "Edit tool"}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col"
        >
          <div className="flex-1 space-y-6 px-6 py-5">
            {/* Basic */}
            <section className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Basic
              </p>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Lookup customer"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Fetches customer data by ID"
                  rows={2}
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-xs text-destructive">
                    {errors.description.message}
                  </p>
                )}
              </div>
            </section>

            <Separator />

            {/* API Config */}
            <section className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API Config
              </p>
              <div className="space-y-2">
                <Label htmlFor="api_url">URL</Label>
                <Input
                  id="api_url"
                  placeholder="https://api.example.com/lookup"
                  {...register("api_url")}
                />
                {errors.api_url && (
                  <p className="text-xs text-destructive">
                    {errors.api_url.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Controller
                  name="api_method"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </section>

            <Separator />

            {/* Headers */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Headers
              </p>
              <Controller
                name="api_headers"
                control={control}
                render={({ field }) => (
                  <KVEditor
                    value={field.value as KVPair[]}
                    onChange={field.onChange}
                    disabled={isPending}
                    secretValues
                  />
                )}
              />
            </section>

            <Separator />

            {/* Query Params */}
            <Controller
              name="api_query_params"
              control={control}
              render={({ field }) => (
                <ParamEditor
                  label="Query Parameters"
                  hint="URL query parameters (optional)"
                  value={field.value as ToolParam[]}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />

            <Separator />

            {/* Path Params */}
            <Controller
              name="api_path_params"
              control={control}
              render={({ field }) => (
                <ParamEditor
                  label="Path Parameters"
                  hint={`Auto-populated from {param} placeholders in the URL`}
                  value={field.value as ToolParam[]}
                  onChange={field.onChange}
                  disableAdd
                  readonlyNames
                  disabled={isPending}
                />
              )}
            />

            <Separator />

            {/* Body */}
            <Controller
              name="api_body"
              control={control}
              render={({ field }) => (
                <ParamEditor
                  label="Body Parameters"
                  value={field.value as ToolParam[]}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />

            <Separator />

            {/* Dynamic Variables */}
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dynamic Variables
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Variables the agent runtime injects into the API call at
                  runtime.
                </p>
              </div>
              <Controller
                name="dynamic_variables"
                control={control}
                render={({ field }) => (
                  <KVEditor
                    value={field.value as KVPair[]}
                    onChange={field.onChange}
                    keyPlaceholder="Variable name"
                    valuePlaceholder="Default value"
                    disabled={isPending}
                  />
                )}
              />
            </section>

            <Separator />

            {/* Behavior */}
            <section className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Behavior
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pre-tool speech</p>
                  <p className="text-xs text-muted-foreground">
                    Agent speaks before calling this tool
                  </p>
                </div>
                <Controller
                  name="force_pre_tool_speech"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  )}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Disable interruptions</p>
                  <p className="text-xs text-muted-foreground">
                    Prevent caller from interrupting while tool runs
                  </p>
                </div>
                <Controller
                  name="disable_interruptions"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Response timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={1}
                  max={300}
                  placeholder="Optional — e.g. 10"
                  className="h-9 w-36"
                  {...register("response_timeout_secs")}
                />
              </div>
            </section>
          </div>

          <SheetFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "Create tool" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>

        {mode === "edit" && tool && (
          <LinkedAgentsSection toolId={tool.toolId} linkedAgents={tool.agent} />
        )}
      </SheetContent>
    </Sheet>
  );
}
