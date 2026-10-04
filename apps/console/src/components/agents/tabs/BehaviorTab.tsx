"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Braces, CheckCircle2, Loader2, Save } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { DynamicVariablesDialog } from "@/src/components/agents/DynamicVariablesDialog";
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
    useAgentConfig,
    useSaveAgentConfig,
} from "@/src/hooks/queries/agents";
import { mergeConfig } from "@/src/lib/agents/config-defaults";
import {
    DEFAULT_FIRST_MESSAGE,
    DEFAULT_SYSTEM_PROMPT,
} from "@/src/lib/agents/config-defaults";
import {
    buildAgentVariables,
    missingDynamicVariableNames,
    normalizeAgentVariables,
    placeholdersForVariables,
    uniqueDynamicVariableNames,
} from "@/src/lib/agents/dynamic-variables";

const schema = z.object({
    systemPrompt: z.string().min(10, "Prompt must be at least 10 characters"),
    firstMessage: z.string().min(5, "First message must be at least 5 characters"),
});

type FormValues = z.infer<typeof schema>;
type DialogIntent = "edit" | "save";

function variableToken(name: string) {
    return `{{${name}}}`;
}

export function BehaviorTab({ agentId }: { agentId: string }) {
    const { data: config, isLoading } = useAgentConfig(agentId);
    const save = useSaveAgentConfig(agentId);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogIntent, setDialogIntent] = useState<DialogIntent>("edit");
    const [placeholderState, setPlaceholderState] = useState({
        source: "",
        values: {} as Record<string, string>,
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            firstMessage: DEFAULT_FIRST_MESSAGE,
        },
    });
    const firstMessageValue = useWatch({
        control: form.control,
        name: "firstMessage",
    });
    const systemPromptValue = useWatch({
        control: form.control,
        name: "systemPrompt",
    });
    const savedVariables = useMemo(
        () => normalizeAgentVariables(config?.variables),
        [config?.variables]
    );
    const savedPlaceholderValues = useMemo(
        () => savedVariables.placeholders ?? {},
        [savedVariables.placeholders]
    );
    const savedPlaceholderSource = useMemo(
        () => JSON.stringify(savedPlaceholderValues),
        [savedPlaceholderValues]
    );

    if (placeholderState.source !== savedPlaceholderSource) {
        setPlaceholderState({
            source: savedPlaceholderSource,
            values: savedPlaceholderValues,
        });
    }

    const placeholderValues =
        placeholderState.source === savedPlaceholderSource
            ? placeholderState.values
            : savedPlaceholderValues;
    const setPlaceholderValues = (values: Record<string, string>) =>
        setPlaceholderState((state) => ({ ...state, values }));
    const detectedVariables = useMemo(
        () =>
            buildAgentVariables(
                firstMessageValue ?? "",
                systemPromptValue ?? "",
                placeholderValues
            ),
        [firstMessageValue, placeholderValues, systemPromptValue]
    );
    const detectedVariableNames = useMemo(
        () => uniqueDynamicVariableNames(detectedVariables),
        [detectedVariables]
    );
    const missingVariableNames = useMemo(
        () => missingDynamicVariableNames(detectedVariables, detectedVariables.placeholders),
        [detectedVariables]
    );
    const placeholdersChanged = detectedVariableNames.some(
        (name) => (placeholderValues[name] ?? "") !== (savedVariables.placeholders?.[name] ?? "")
    );
    const hasPendingChanges = form.formState.isDirty || placeholdersChanged;

    useEffect(() => {
        if (!config) return;
        form.reset({
            systemPrompt: config.systemPrompt,
            firstMessage: config.firstMessage,
        });
    }, [config, form]);

    function openVariableDialog(intent: DialogIntent) {
        setPlaceholderValues(placeholdersForVariables(detectedVariables, placeholderValues));
        setDialogIntent(intent);
        setDialogOpen(true);
    }

    async function saveValues(values: FormValues) {
        const variables = buildAgentVariables(
            values.firstMessage,
            values.systemPrompt,
            placeholderValues
        );

        await save.mutateAsync(mergeConfig(config, { ...values, variables }));
        form.reset(values);
        setPlaceholderValues(variables.placeholders ?? {});
    }

    async function onSubmit(values: FormValues) {
      try {
          const variables = buildAgentVariables(
              values.firstMessage,
              values.systemPrompt,
              placeholderValues
          );
          const missingVariables = missingDynamicVariableNames(
              variables,
              variables.placeholders
          );

          if (missingVariables.length > 0) {
              openVariableDialog("save");
              return;
          }

          await saveValues(values);
      } catch {
        // The mutation hook displays the API error; preserve the current state for retry.
      }
    }

    async function onDialogConfirm() {
      try {
          if (dialogIntent === "save") {
              await saveValues(form.getValues());
          }
          setDialogOpen(false);
      } catch {
        // The mutation hook displays the API error; preserve the current state for retry.
      }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <section className="border bg-card p-6">
                    <div className="mb-5 space-y-1">
                        <h2 className="text-base font-semibold">Persona</h2>
                        <p className="text-sm text-muted-foreground">
                            How the agent introduces itself and behaves on a call.
                        </p>
                    </div>
                    <div className="space-y-5">
                        <FormField
                            control={form.control}
                            name="firstMessage"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>First message</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Hi, thanks for calling..."
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Spoken immediately when the call connects.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="systemPrompt"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>System prompt</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            rows={10}
                                            placeholder="Describe the agent's role, constraints, and tone."
                                            className="resize-none font-mono text-xs leading-relaxed"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Use {variableToken("variable")} to interpolate runtime values.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {detectedVariableNames.length > 0 ? (
                            <div className="border border-dashed bg-muted/20 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium">Dynamic variables</p>
                                            {missingVariableNames.length === 0 ? (
                                                <Badge variant="secondary" className="gap-1">
                                                    <CheckCircle2 /> Ready
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">
                                                    {missingVariableNames.length} fallback{missingVariableNames.length === 1 ? "" : "s"} needed
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Fallback values are used when call data does not include a value.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => openVariableDialog("edit")}
                                    >
                                        <Braces /> Set values
                                    </Button>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {detectedVariableNames.map((name) => (
                                        <Badge
                                            key={name}
                                            variant={placeholderValues[name]?.trim() ? "secondary" : "outline"}
                                        >
                                            {variableToken(name)}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </section>

                <div className="flex items-center justify-end gap-3">
                    <Button
                        type="submit"
                        disabled={save.isPending || isLoading || !hasPendingChanges}
                    >
                        {save.isPending ? (
                            <>
                                <Loader2 className="animate-spin" /> Saving...
                            </>
                        ) : (
                            <>
                                <Save /> Save changes
                            </>
                        )}
                    </Button>
                </div>
            </form>
            <DynamicVariablesDialog
                open={dialogOpen}
                variableNames={detectedVariableNames}
                values={placeholderValues}
                confirmLabel={dialogIntent === "save" ? "Save changes" : "Done"}
                isSaving={save.isPending}
                onOpenChange={setDialogOpen}
                onValuesChange={setPlaceholderValues}
                onConfirm={onDialogConfirm}
            />
        </Form>
    );
}
