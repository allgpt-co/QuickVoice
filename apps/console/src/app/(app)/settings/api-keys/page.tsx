"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { authClient } from "@/src/lib/auth-client";

type ApiKey = {
  id: string;
  name?: string | null;
  start?: string | null;
  createdAt?: string | Date;
  lastRequest?: string | Date | null;
  enabled?: boolean | null;
  expiresAt?: string | Date | null;
};

const schema = z.object({
  name: z.string().min(2, "Name is required"),
});

export default function ApiKeysPage() {
  const { data: session } = authClient.useSession();
  const orgId = session?.session?.activeOrganizationId ?? null;

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function refresh() {
    if (!orgId) return;
    setLoading(true);
    try {
      const api = authClient.apiKey as {
        list?: (input: {
          query?: { organizationId?: string };
        }) => Promise<{ data?: ApiKey[] }>;
      };
      if (api.list) {
        const res = await api.list({ query: { organizationId: orgId } });
        setKeys(res.data ?? []);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load API keys",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function onCreate(values: z.infer<typeof schema>) {
    if (!orgId) return;
    setCreating(true);
    try {
      const api = authClient.apiKey as {
        create?: (input: { name: string; organizationId: string }) => Promise<{
          data?: { key: string };
          error?: { message?: string };
        }>;
      };
      if (!api.create) throw new Error("API key creation is not available");
      const { data, error } = await api.create({
        name: values.name,
        organizationId: orgId,
      });
      if (error || !data?.key)
        throw new Error(error?.message ?? "Create failed");
      setNewKey({ key: data.key, name: values.name });
      setCreateOpen(false);
      form.reset();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(keyId: string) {
    try {
      const api = authClient.apiKey as {
        delete?: (input: { keyId: string }) => Promise<{
          error?: { message?: string };
        }>;
      };
      if (!api.delete) throw new Error("API key delete is not available");
      const { error } = await api.delete({ keyId });
      if (error) throw new Error(error.message ?? "Revoke failed");
      toast.success("Key revoked");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke key");
    }
  }

  async function copyNewKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <section className="border bg-card p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">API keys</h2>
            <p className="text-sm text-muted-foreground">
              Use these organization-scoped keys to authenticate the QuickVoice
              API and QuickVoice MCP server with the{" "}
              <code className="bg-muted px-1 py-0.5 font-mono text-xs">
                x-api-key
              </code>{" "}
              header.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> New API key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Give the key a descriptive name. You&apos;ll be able to copy
                  it once — make sure to store it somewhere safe. New keys are
                  organization-scoped and MCP-ready by default.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onCreate)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Production API" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" /> Creating…
                        </>
                      ) : (
                        "Create key"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !keys.length ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create a key to call QuickVoice from your application."
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {k.start ? `${k.start}••••••••` : "••••••••"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={k.enabled === false ? "secondary" : "default"}
                    >
                      {k.enabled === false ? "Disabled" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.createdAt
                      ? new Date(k.createdAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Revoke"
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any application using this key will stop working
                            immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRevoke(k.id)}>
                            Revoke
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog open={!!newKey} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This is the only time you&apos;ll see the full key. Copy it now
              and store it in a secure place.
            </DialogDescription>
          </DialogHeader>
          <div className="border bg-muted/30 p-3 font-mono text-xs break-all">
            {newKey?.key}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyNewKey}>
              {copied ? (
                <>
                  <Check /> Copied
                </>
              ) : (
                <>
                  <Copy /> Copy key
                </>
              )}
            </Button>
            <Button onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
