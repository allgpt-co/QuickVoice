"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Progress } from "@/src/components/ui/progress";
import { Skeleton } from "@/src/components/ui/skeleton";
import { authClient } from "@/src/lib/auth-client";
import { useBillingUsage } from "@/src/hooks/queries/billing";
import { cn } from "@/src/lib/utils";

interface Plan {
 id: string;
 name: string;
 description: string;
 price: number;
 currency: string;
 minutes: number;
 features: string[];
}

const PLANS: Plan[] = [
 {
 id: "free",
 name: "Free",
 description: "Try it out",
 price: 0,
 currency: "USD",
 minutes: 15,
 features: ["15 minutes included", "1 agent", "Community support"],
 },
 {
 id: "starter",
 name: "Starter",
 description: "For side projects",
 price: 49,
 currency: "USD",
 minutes: 245,
 features: ["245 minutes / month", "3 agents", "Email support"],
 },
 {
 id: "growth",
 name: "Growth",
 description: "For growing teams",
 price: 99,
 currency: "USD",
 minutes: 600,
 features: ["600 minutes / month", "10 agents", "Priority support"],
 },
 {
 id: "scale",
 name: "Scale",
 description: "For production workloads",
 price: 399,
 currency: "USD",
 minutes: 2660,
 features: ["2,660 minutes / month", "Unlimited agents", "Dedicated support"],
 },
];

export default function BillingPage() {
 type Sub = { plan?: string; status?: string } & Record<string, unknown>;
 const [currentPlan, setCurrentPlan] = useState<string>("free");
 const [subscription, setSubscription] = useState<Sub | null>(null);
 const [loading, setLoading] = useState(true);
 const [portalLoading, setPortalLoading] = useState(false);
 const [upgradingId, setUpgradingId] = useState<string | null>(null);

 const { data: session } = authClient.useSession();
 const orgId = session?.session?.activeOrganizationId ?? null;
 const usage = useBillingUsage(Boolean(orgId));

 useEffect(() => {
 async function load() {
 if (!orgId) {
 setLoading(false);
 return;
 }
 setLoading(true);
 try {
 const sub = authClient.subscription as {
 list?: (input: {
 query: {
 referenceId: string;
 customerType: "organization";
 };
 }) => Promise<{
 data?: Sub[];
 }>;
 };
 if (sub.list) {
 const result = await sub.list({
 query: {
 referenceId: orgId,
 customerType: "organization",
 },
 });
 const active = result.data?.find(
 (s) => (s as Sub).status === "active" || (s as Sub).status === "trialing"
 );
 if (active) {
 setSubscription(active);
 setCurrentPlan(String(active.plan ?? "free"));
 }
 }
 } catch (err) {
 console.warn("Could not load subscription", err);
 } finally {
 setLoading(false);
 }
 }
 load();
 }, [orgId]);

 async function onUpgrade(planId: string) {
 if (!orgId) return;
 setUpgradingId(planId);
 try {
 const sub = authClient.subscription as {
 upgrade?: (input: {
 plan: string;
 referenceId: string;
 customerType: "organization";
 successUrl?: string;
 cancelUrl?: string;
 }) => Promise<{ data?: unknown; error?: { message?: string } }>;
 };
 if (!sub.upgrade) throw new Error("Upgrade is not available");
 const { error } = await sub.upgrade({
 plan: planId,
 referenceId: orgId,
 customerType: "organization",
 successUrl: window.location.href,
 cancelUrl: window.location.href,
 });
 if (error) throw new Error(error.message ?? "Upgrade failed");
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Upgrade failed");
 } finally {
 setUpgradingId(null);
 }
 }

 async function openPortal() {
 if (!orgId) return;
 setPortalLoading(true);
 try {
 const sub = authClient.subscription as {
 billingPortal?: (input: {
 referenceId: string;
 customerType: "organization";
 returnUrl?: string;
 }) => Promise<{ data?: { url?: string }; error?: { message?: string } }>;
 };
 if (!sub.billingPortal) throw new Error("Billing portal is not available");
 const { data, error } = await sub.billingPortal({
 referenceId: orgId,
 customerType: "organization",
 returnUrl: window.location.href,
 });
 if (error || !data?.url) throw new Error(error?.message ?? "No portal URL");
 window.location.href = data.url;
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not open portal");
 } finally {
 setPortalLoading(false);
 }
 }

 const effectivePlan = usage.data?.plan ?? currentPlan;
 const plan = PLANS.find((p) => p.id === effectivePlan) ?? PLANS[0];
 const includedMinutes = usage.data?.includedMinutes ?? plan.minutes;
 const periodLabel = usage.data
 ? new Date(usage.data.periodEnd).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 })
 : null;

 return (
 <div className="space-y-6">
 <section className="border bg-card p-6">
 <div className="mb-5 flex items-start justify-between gap-3">
 <div className="space-y-1">
 <h2 className="text-base font-semibold">Current plan</h2>
 <p className="text-sm text-muted-foreground">
 Billing runs monthly; overages are metered per minute on paid
 plans.
 </p>
 </div>
 <Button variant="outline" onClick={openPortal} disabled={portalLoading || !orgId}>
 {portalLoading ? (
 <Loader2 className="animate-spin" />
 ) : (
 <ExternalLink />
 )}
 Open billing portal
 </Button>
 </div>
 {loading ? (
 <Skeleton className="h-20 w-full" />
 ) : (
 <div className="grid gap-4 border bg-muted/20 p-5 sm:grid-cols-[1fr_auto]">
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <h3 className="text-lg font-semibold">{plan.name}</h3>
 <Badge variant="secondary" className="uppercase">
 {String(subscription?.status ?? usage.data?.subscriptionStatus ?? "free")}
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground">
 {plan.description} · {plan.minutes.toLocaleString()} minutes
 included
 </p>
 </div>
 <div className="text-right">
 <p className="text-2xl font-semibold">
 {plan.price === 0 ? "Free" : `$${plan.price}`}
 <span className="text-sm font-normal text-muted-foreground">
 {plan.price === 0 ? "" : " / mo"}
 </span>
 </p>
 </div>
 <div className="sm:col-span-2">
 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <span>Usage this period</span>
 <span className="font-mono">
 {usage.isLoading
 ? "Loading..."
 : `${usage.data?.usedMinutes ?? 0} / ${includedMinutes ?? "Unlimited"}`}
 </span>
 </div>
 <Progress
 value={Math.min(usage.data?.percentUsed ?? 0, 100)}
 className="mt-2 h-1.5"
 />
 {usage.isError ? (
 <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
 <span>Could not load usage for this billing period.</span>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={() => usage.refetch()}
 disabled={usage.isFetching}
 >
 <RefreshCw className={usage.isFetching ? "animate-spin" : undefined} />
 Retry
 </Button>
 </div>
 ) : usage.data ? (
 <p className="mt-1 text-[11px] text-muted-foreground">
 {usage.data.overageMinutes > 0
 ? `${usage.data.overageMinutes} overage minutes`
 : usage.data.remainingMinutes === null
 ? `${usage.data.callCount} calls this period`
 : `${usage.data.remainingMinutes} minutes remaining`}
 {periodLabel ? ` · Period ends ${periodLabel}` : ""}
 </p>
 ) : null}
 </div>
 </div>
 )}
 </section>

 <section className="space-y-4">
 <div>
 <h2 className="text-base font-semibold">Available plans</h2>
 <p className="text-sm text-muted-foreground">
 Upgrade or downgrade at any time.
 </p>
 </div>
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
 {PLANS.map((p) => {
 const isCurrent = p.id === effectivePlan;
 return (
 <div
 key={p.id}
 className={cn(
 "relative flex flex-col gap-4 border p-5",
 isCurrent
 ? "border-primary bg-gradient-to-br from-primary/10 to-primary/0"
 : "bg-card"
 )}
 >
 <div>
 <h3 className="text-sm font-semibold">{p.name}</h3>
 <p className="text-xs text-muted-foreground">
 {p.description}
 </p>
 </div>
 <p className="text-2xl font-semibold">
 {p.price === 0 ? "Free" : `$${p.price}`}
 {p.price === 0 ? (
 ""
 ) : (
 <span className="text-xs font-normal text-muted-foreground">
 {" "}
 / mo
 </span>
 )}
 </p>
 <ul className="flex-1 space-y-2 text-xs text-muted-foreground">
 {p.features.map((f) => (
 <li key={f} className="flex items-start gap-2">
 <Check className="mt-0.5 size-3.5 text-primary" />
 {f}
 </li>
 ))}
 </ul>
 <Button
 variant={isCurrent ? "outline" : "default"}
 disabled={!orgId || isCurrent || upgradingId === p.id}
 onClick={() => onUpgrade(p.id)}
 >
 {isCurrent ? (
 "Current plan"
 ) : upgradingId === p.id ? (
 <>
 <Loader2 className="animate-spin" /> Redirecting…
 </>
 ) : (
 "Choose plan"
 )}
 </Button>
 </div>
 );
 })}
 </div>
 </section>

 <p className="text-xs text-muted-foreground">
 Need a custom plan?{" "}
 <Link href="mailto:sales@quickvoice.ai" className="underline">
 Contact sales
 </Link>
 .
 </p>
 </div>
 );
}
