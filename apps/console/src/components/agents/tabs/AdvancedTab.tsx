"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BookOpen,
  Keyboard,
  Loader2,
  Radio,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/src/components/ui/alert-dialog";
import {
  useAgentConfig,
  useDeleteAgent,
  useSaveAgentConfig,
  useUpdateAgent,
} from "@/src/hooks/queries/agents";
import { mergeConfig } from "@/src/lib/agents/config-defaults";

const schema = z
  .object({
    use_rag: z.boolean(),
    preemptive_generation: z.boolean(),
    ivr_navigation_enabled: z.boolean(),
    store_call_audio: z.boolean(),
    zero_pii_retention: z.boolean(),
    conversation_retention_days: z.number().int().min(1).max(3650),
  })
  .refine((values) => !(values.zero_pii_retention && values.store_call_audio), {
    path: ["store_call_audio"],
    message: "Disable call audio before enabling zero-PII retention",
  });

type FormValues = z.infer<typeof schema>;

const runtimeFeatures = [
  {
    name: "use_rag" as const,
    label: "Knowledge retrieval",
    description: "Search attached knowledge-base documents during calls.",
    icon: BookOpen,
  },
  {
    name: "preemptive_generation" as const,
    label: "Preemptive generation",
    description:
      "Start preparing the next response before the caller finishes speaking.",
    icon: Zap,
  },
  {
    name: "ivr_navigation_enabled" as const,
    label: "IVR navigation",
    description:
      "Allow the agent to send DTMF tones when it reaches an automated phone menu.",
    icon: Keyboard,
  },
];

export function AdvancedTab({ agentId }: { agentId: string }) {
  const router = useRouter();
  const { data: config, isLoading } = useAgentConfig(agentId);
  const save = useSaveAgentConfig(agentId);
  const update = useUpdateAgent(agentId);
  const deleteAgent = useDeleteAgent();
  const [confirming, setConfirming] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      use_rag: false,
      preemptive_generation: false,
      ivr_navigation_enabled: true,
      store_call_audio: true,
      zero_pii_retention: false,
      conversation_retention_days: 30,
    },
  });
  const ivrEnabled = useWatch({
    control: form.control,
    name: "ivr_navigation_enabled",
  });
  const zeroPiiRetention = useWatch({
    control: form.control,
    name: "zero_pii_retention",
  });

  useEffect(() => {
    if (!config) return;
    form.reset({
      use_rag: config.use_rag,
      preemptive_generation: config.preemptive_generation,
      ivr_navigation_enabled: config.ivr_navigation_enabled ?? true,
      store_call_audio: config.store_call_audio,
      zero_pii_retention: config.zero_pii_retention,
      conversation_retention_days: config.conversation_retention_days,
    });
  }, [config, form]);

  async function onSubmit(values: FormValues) {
    await save.mutateAsync(mergeConfig(config, values));
    form.reset(values);
  }

  async function pauseAgent() {
    await update.mutateAsync({ isActive: false });
    toast.success("Agent paused");
  }

  async function resumeAgent() {
    await update.mutateAsync({ isActive: true });
    toast.success("Agent resumed");
  }

  async function confirmDelete() {
    await deleteAgent.mutateAsync(agentId);
    setConfirming(false);
    router.push("/agents");
  }

  return (
    <div className="space-y-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <section className="border bg-card p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Runtime features</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Configure behaviors that change how the agent listens,
                  searches, and moves through phone systems.
                </p>
              </div>
              <div className="flex items-center gap-2 border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                <Radio className="size-3.5" />
                <span>
                  {ivrEnabled ? "IVR tones enabled" : "IVR tones disabled"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {runtimeFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <FormField
                    key={feature.name}
                    control={form.control}
                    name={feature.name}
                    render={({ field }) => (
                      <FormItem className="flex min-h-[168px] flex-col justify-between border bg-background p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex size-9 items-center justify-center border bg-muted text-muted-foreground">
                              <Icon className="size-4" />
                            </span>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </div>
                          <div className="space-y-1">
                            <FormLabel className="text-sm font-semibold">
                              {feature.label}
                            </FormLabel>
                            <FormDescription className="text-sm leading-relaxed">
                              {feature.description}
                            </FormDescription>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />
                );
              })}
            </div>
          </section>

          <section className="border bg-card p-6">
            <div className="mb-5 space-y-1">
              <h2 className="text-base font-semibold">Data retention</h2>
              <p className="text-sm text-muted-foreground">
                Control what future calls persist and how long transcripts
                remain.
              </p>
            </div>
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="zero_pii_retention"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Zero-PII retention</FormLabel>
                      <FormDescription>
                        Do not persist transcripts or recordings for future
                        calls.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) {
                            form.setValue("store_call_audio", false, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="store_call_audio"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Store call audio</FormLabel>
                      <FormDescription>
                        Save recordings for future calls in configured object
                        storage.
                      </FormDescription>
                      <FormMessage />
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={zeroPiiRetention}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conversation_retention_days"
                render={({ field }) => (
                  <FormItem className="border p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-center">
                      <div className="space-y-0.5">
                        <FormLabel>Transcript retention</FormLabel>
                        <FormDescription>
                          Delete persisted transcripts after this many days.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          step={1}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(event.target.valueAsNumber)
                          }
                          disabled={zeroPiiRetention}
                          aria-label="Transcript retention in days"
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              disabled={save.isPending || isLoading || !form.formState.isDirty}
            >
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save /> Save
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      <section className="border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-destructive">
              Danger zone
            </h2>
            <p className="text-sm text-muted-foreground">
              Pause the agent to stop new calls temporarily, or delete it
              permanently.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={pauseAgent}
              disabled={update.isPending || deleteAgent.isPending}
            >
              Pause agent
            </Button>
            <Button
              variant="outline"
              onClick={resumeAgent}
              disabled={update.isPending || deleteAgent.isPending}
            >
              Resume agent
            </Button>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleteAgent.isPending}>
                  <Trash2 /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes the agent and detaches it from phone numbers,
                    tools, and knowledge sources. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmDelete}
                    disabled={deleteAgent.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteAgent.isPending ? (
                      <>
                        <Loader2 className="animate-spin" /> Deleting...
                      </>
                    ) : (
                      "Delete"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>
    </div>
  );
}
