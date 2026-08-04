"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  ClipboardList,
  Headphones,
  HeartPulse,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { useCreateAgent } from "@/src/hooks/queries/agents";
import { cn } from "@/src/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Agent name must be at least 2 characters"),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const templates = [
  {
    id: "business",
    title: "Business Agent",
    description: "General purpose calls, lead qualification, and follow-ups.",
    icon: Building2,
  },
  {
    id: "medical",
    title: "Medical Agent",
    description:
      "Patient intake, appointment reminders, and front-desk workflows.",
    icon: HeartPulse,
  },
  {
    id: "questionnaire",
    title: "Questionnaire Agent",
    description: "Outbound CSV questionnaires with structured answer capture.",
    icon: ClipboardList,
  },
  {
    id: "blank",
    title: "Blank Agent",
    description: "Start from an empty configuration and customize everything.",
    icon: Sparkles,
  },
  {
    id: "support",
    title: "Support Agent",
    description: "Customer questions, ticket triage, and post-call summaries.",
    icon: Headphones,
  },
] as const;

type TemplateId = (typeof templates)[number]["id"];

export function NewAgentDialog() {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("blank");
  const router = useRouter();
  const createAgent = useCreateAgent();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", isActive: true },
  });

  async function onSubmit(values: FormValues) {
    const agent = await createAgent.mutateAsync({
      name: values.name,
      isActive: values.isActive,
      templateId: selectedTemplate,
    });
    toast.success(`Agent "${agent.name}" created`);
    setOpen(false);
    setSelectedTemplate("blank");
    form.reset();
    router.push(`/agents/${agent.agentId}?tab=behavior`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create agent</DialogTitle>
          <DialogDescription>
            Give your agent a name. You can configure voice, prompts, and
            webhooks next.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Sales Qualifier"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Label>Choose a template</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((template) => {
                  const Icon = template.icon;
                  const isSelected = selectedTemplate === template.id;

                  return (
                    <div
                      key={template.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedTemplate(template.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTemplate(template.id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                        isSelected &&
                          "border-primary bg-accent/60 shadow-[0_0_0_1px_rgba(var(--primary-rgb),0.18)]",
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg border text-muted-foreground",
                            isSelected &&
                              "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                          {template.title}
                        </p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>{field.value ? "Active" : "Paused"}</Label>
                    <p className="text-xs text-muted-foreground">
                      Toggle whether this agent can handle calls immediately.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createAgent.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createAgent.isPending}>
                {createAgent.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> Creating…
                  </>
                ) : (
                  "Create agent"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
