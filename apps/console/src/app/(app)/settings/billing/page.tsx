"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Gift,
  LockKeyhole,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import {
  isStripeClientConfigured,
  PaymentMethodSetupDialog,
  TopUpCheckoutDialog,
} from "@/src/components/billing/StripeBillingDialogs";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  useBillingSummary,
  useBillingTransactions,
  useCreatePaymentMethodSetup,
  useCreateTopUpCheckout,
  useUpdateAutoRecharge,
} from "@/src/hooks/queries/billing";
import { authClient } from "@/src/lib/auth-client";
import type {
  BillingSummary,
  BillingTransactionsPage,
  MoneyMicros,
} from "@/src/lib/api/resources/billing";
import { pollForBillingUpdate } from "@/src/lib/billing/polling";
import { getTransactionPresentation } from "@/src/lib/billing/transaction-presentation";
import { queryKeys } from "@/src/lib/query-keys";
import { cn } from "@/src/lib/utils";

const TOP_UP_PRESETS = [5, 20, 50, 100] as const;
const MIN_RECHARGE_DOLLARS = 5;
const MAX_RECHARGE_DOLLARS = 500;
const currencyFormatters = new Map<string, Intl.NumberFormat>();

interface TopUpAttempt {
  amountCents: number;
  idempotencyKey: string;
  organizationId: string;
  topUpId?: string;
}

interface TopUpConfirmation {
  status: "processing" | "timed-out";
  topUpId: string;
}

interface PaymentMethodConfirmation {
  baselinePaymentMethodId: string | null;
  expectedPaymentMethodId: string | null;
  status: "processing" | "timed-out";
}

function asMicros(value: MoneyMicros | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMicros(value: MoneyMicros | null | undefined, currency = "USD") {
  const normalizedCurrency = currency.toUpperCase();
  let formatter = currencyFormatters.get(normalizedCurrency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(normalizedCurrency, formatter);
  }
  return formatter.format(asMicros(value) / 1_000_000);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanize(value: string | null | undefined) {
  if (!value) return "Wallet adjustment";
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function autoRechargeValues(summary: BillingSummary | undefined) {
  const auto = summary?.autoRecharge;
  const thresholdCents =
    auto?.thresholdCents ??
    asMicros(auto?.thresholdMicros ?? summary?.autoRechargeThresholdMicros) /
      10_000;
  const amountCents =
    auto?.amountCents ??
    asMicros(auto?.amountMicros ?? summary?.autoRechargeAmountMicros) / 10_000;

  return {
    enabled: auto?.enabled ?? summary?.autoRechargeEnabled ?? false,
    thresholdDollars: thresholdCents > 0 ? thresholdCents / 100 : 5,
    amountDollars: amountCents > 0 ? amountCents / 100 : 20,
  };
}

function openCheckoutUrl(value: string) {
  const url = new URL(value, window.location.origin);
  if (url.protocol !== "https:" && url.origin !== window.location.origin) {
    throw new Error("The payment URL was not secure");
  }
  window.location.assign(url.toString());
}

function BalanceCard({
  icon: Icon,
  label,
  amount,
  description,
  className,
}: {
  icon: typeof WalletCards;
  label: string;
  amount: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{amount}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export default function BillingPage() {
  const { data: session } = authClient.useSession();
  const organizationId = session?.session?.activeOrganizationId ?? null;

  return (
    <OrganizationBillingPage
      key={organizationId ?? "no-organization"}
      organizationId={organizationId}
    />
  );
}

function OrganizationBillingPage({
  organizationId,
}: {
  organizationId: string | null;
}) {
  const summary = useBillingSummary(organizationId);
  const transactions = useBillingTransactions(organizationId);
  const createCheckout = useCreateTopUpCheckout();
  const createPaymentSetup = useCreatePaymentMethodSetup();
  const updateAutoRecharge = useUpdateAutoRecharge();
  const queryClient = useQueryClient();

  const [topUpDollars, setTopUpDollars] = useState(20);
  const [topUpAttempt, setTopUpAttempt] = useState<TopUpAttempt | null>(null);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState(2_000);
  const [checkoutTopUpId, setCheckoutTopUpId] = useState<string | null>(null);
  const [topUpConfirmation, setTopUpConfirmation] =
    useState<TopUpConfirmation | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupBaselinePaymentMethodId, setSetupBaselinePaymentMethodId] =
    useState<string | null>(null);
  const [paymentMethodConfirmation, setPaymentMethodConfirmation] =
    useState<PaymentMethodConfirmation | null>(null);
  const [autoDraft, setAutoDraft] = useState<{
    enabled: boolean;
    thresholdDollars: number;
    reloadDollars: number;
  } | null>(null);
  const topUpPollController = useRef<AbortController | null>(null);
  const paymentMethodPollController = useRef<AbortController | null>(null);
  const isActiveRef = useRef(true);

  const savedAutoRecharge = autoRechargeValues(summary.data);
  const autoEnabled = autoDraft?.enabled ?? savedAutoRecharge.enabled;
  const thresholdDollars =
    autoDraft?.thresholdDollars ?? savedAutoRecharge.thresholdDollars;
  const reloadDollars =
    autoDraft?.reloadDollars ?? savedAutoRecharge.amountDollars;

  const currency = summary.data?.currency ?? "USD";
  const paidMicros = asMicros(
    summary.data?.paidAvailableMicros ??
      summary.data?.availablePaidOnlyMicros ??
      summary.data?.paidBalanceMicros,
  );
  const promotionalMicros = asMicros(
    summary.data?.promotionalAvailableMicros ??
      summary.data?.promotionalBalanceMicros ??
      summary.data?.promoBalanceMicros,
  );
  const availableMicros = asMicros(
    summary.data?.availableUsageMicros ??
      summary.data?.availableBalanceMicros ??
      summary.data?.totalBalanceMicros ??
      paidMicros + promotionalMicros,
  );
  const debtMicros = asMicros(
    summary.data?.outstandingDebtMicros ?? summary.data?.debtMicros,
  );
  const canManageBilling =
    summary.data?.canManageBilling ??
    summary.data?.canManage ??
    summary.data?.permissions?.canManageBilling ??
    false;
  const billingMode = (
    summary.data?.billingMode ??
    summary.data?.mode ??
    "hosted"
  ).toLowerCase();
  const isUnmetered =
    billingMode.includes("self") || billingMode === "unmetered";
  const hasPaymentMethod = Boolean(
    summary.data?.hasSavedPaymentMethod ||
    summary.data?.hasPaymentMethod ||
    summary.data?.paymentMethod,
  );
  const paymentMethod = summary.data?.paymentMethod;
  const topUpValid =
    Number.isInteger(topUpDollars) &&
    topUpDollars >= MIN_RECHARGE_DOLLARS &&
    topUpDollars <= MAX_RECHARGE_DOLLARS &&
    topUpDollars % 5 === 0;
  const autoValuesValid =
    Number.isInteger(thresholdDollars) &&
    Number.isInteger(reloadDollars) &&
    thresholdDollars >= MIN_RECHARGE_DOLLARS &&
    thresholdDollars <= MAX_RECHARGE_DOLLARS &&
    reloadDollars >= MIN_RECHARGE_DOLLARS &&
    reloadDollars <= MAX_RECHARGE_DOLLARS &&
    thresholdDollars % 5 === 0 &&
    reloadDollars % 5 === 0 &&
    reloadDollars > thresholdDollars;

  const sortedTransactions = useMemo(
    () =>
      [...(transactions.data?.items ?? [])].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [transactions.data?.items],
  );

  useEffect(
    () => () => {
      isActiveRef.current = false;
      topUpPollController.current?.abort();
      paymentMethodPollController.current?.abort();
    },
    [],
  );

  const pollForTopUpConfirmation = useCallback(
    async (topUpId: string) => {
      topUpPollController.current?.abort();
      const controller = new AbortController();
      topUpPollController.current = controller;
      setTopUpConfirmation({ status: "processing", topUpId });

      const result = await pollForBillingUpdate({
        signal: controller.signal,
        check: async () => {
          await Promise.all([
            queryClient.refetchQueries({
              queryKey: queryKeys.billing.summary(organizationId),
              exact: true,
            }),
            queryClient.refetchQueries({
              queryKey: queryKeys.billing.transactions(organizationId),
              exact: true,
            }),
          ]);
          const latestTransactions =
            queryClient.getQueryData<BillingTransactionsPage>(
              queryKeys.billing.transactions(organizationId),
            );
          return Boolean(
            latestTransactions?.items.some(
              (transaction) => transaction.referenceId === topUpId,
            ),
          );
        },
      });

      if (controller.signal.aborted) return;
      if (result === "matched") {
        setTopUpConfirmation(null);
        toast.success("Payment confirmed and wallet balance updated");
      } else if (result === "timed-out") {
        setTopUpConfirmation({ status: "timed-out", topUpId });
      }
      if (topUpPollController.current === controller) {
        topUpPollController.current = null;
      }
    },
    [organizationId, queryClient],
  );

  const pollForPaymentMethodConfirmation = useCallback(
    async (
      expectedPaymentMethodId: string | null,
      baselinePaymentMethodId: string | null,
    ) => {
      paymentMethodPollController.current?.abort();
      const controller = new AbortController();
      paymentMethodPollController.current = controller;
      const confirmation = {
        baselinePaymentMethodId,
        expectedPaymentMethodId,
      };
      setPaymentMethodConfirmation({
        ...confirmation,
        status: "processing",
      });

      const result = await pollForBillingUpdate({
        signal: controller.signal,
        check: async () => {
          await queryClient.refetchQueries({
            queryKey: queryKeys.billing.summary(organizationId),
            exact: true,
          });
          const latestSummary = queryClient.getQueryData<BillingSummary>(
            queryKeys.billing.summary(organizationId),
          );
          const latestPaymentMethodId =
            latestSummary?.paymentMethod?.id ?? null;

          if (expectedPaymentMethodId) {
            return latestPaymentMethodId === expectedPaymentMethodId;
          }
          if (!baselinePaymentMethodId) {
            return Boolean(
              latestPaymentMethodId ||
              latestSummary?.hasPaymentMethod ||
              latestSummary?.hasSavedPaymentMethod,
            );
          }
          return (
            latestPaymentMethodId !== null &&
            latestPaymentMethodId !== baselinePaymentMethodId
          );
        },
      });

      if (controller.signal.aborted) return;
      if (result === "matched") {
        setPaymentMethodConfirmation(null);
        toast.success("Payment method saved");
      } else if (result === "timed-out") {
        setPaymentMethodConfirmation({
          ...confirmation,
          status: "timed-out",
        });
      }
      if (paymentMethodPollController.current === controller) {
        paymentMethodPollController.current = null;
      }
    },
    [organizationId, queryClient],
  );

  const onCheckoutComplete = useCallback(() => {
    const completedTopUpId = checkoutTopUpId ?? topUpAttempt?.topUpId ?? null;
    setCheckoutSecret(null);
    setCheckoutTopUpId(null);
    setTopUpAttempt(null);

    if (!completedTopUpId) {
      toast.info("Payment submitted. Refreshing wallet activity…");
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
      return;
    }

    toast.info("Payment submitted. Waiting for secure confirmation…");
    void pollForTopUpConfirmation(completedTopUpId);
  }, [checkoutTopUpId, pollForTopUpConfirmation, queryClient, topUpAttempt]);

  const onSetupComplete = useCallback(
    (expectedPaymentMethodId: string | null) => {
      const baselinePaymentMethodId = setupBaselinePaymentMethodId;
      setSetupSecret(null);
      setSetupBaselinePaymentMethodId(null);
      toast.info("Card submitted. Waiting for secure confirmation…");
      void pollForPaymentMethodConfirmation(
        expectedPaymentMethodId,
        baselinePaymentMethodId,
      );
    },
    [pollForPaymentMethodConfirmation, setupBaselinePaymentMethodId],
  );

  function changeTopUpAmount(nextDollars: number) {
    setTopUpDollars(nextDollars);
    const nextAmountCents = Number.isFinite(nextDollars)
      ? nextDollars * 100
      : 0;
    setTopUpAttempt((current) =>
      current?.amountCents === nextAmountCents ? current : null,
    );
  }

  async function beginTopUp() {
    if (!topUpValid) {
      toast.error("Choose an amount from $5 to $500 in $5 increments");
      return;
    }
    if (!isStripeClientConfigured) {
      toast.error("Stripe is not configured for this console");
      return;
    }
    if (!organizationId) {
      toast.error("Choose an organization before adding credit");
      return;
    }

    const amountCents = topUpDollars * 100;
    const reusableAttempt =
      topUpAttempt?.amountCents === amountCents &&
      topUpAttempt.organizationId === organizationId
        ? topUpAttempt
        : null;
    if (!reusableAttempt && !globalThis.crypto?.randomUUID) {
      toast.error(
        "Secure payment IDs are unavailable. Reload this page over HTTPS.",
      );
      return;
    }
    const attempt = reusableAttempt ?? {
      amountCents,
      idempotencyKey: globalThis.crypto.randomUUID(),
      organizationId,
    };

    try {
      setTopUpAttempt(attempt);

      const result = await createCheckout.mutateAsync({
        amountCents,
        idempotencyKey: attempt.idempotencyKey,
      });
      if (!isActiveRef.current) return;
      if (!result.topUpId) {
        toast.error("Stripe did not return top-up tracking information");
        return;
      }
      setTopUpAttempt((current) =>
        current?.idempotencyKey === attempt.idempotencyKey
          ? { ...current, topUpId: result.topUpId }
          : current,
      );
      setCheckoutTopUpId(result.topUpId);
      if (result.clientSecret) {
        setCheckoutAmountCents(amountCents);
        setCheckoutSecret(result.clientSecret);
        return;
      }
      if (result.url) {
        openCheckoutUrl(result.url);
        return;
      }
      toast.error("Stripe did not return a checkout session");
    } catch {
      // Mutation-level error feedback handles failed checkout requests.
    }
  }

  async function beginPaymentSetup() {
    if (!isStripeClientConfigured) {
      toast.error("Stripe is not configured for this console");
      return;
    }
    if (!organizationId) {
      toast.error("Choose an organization before saving a payment method");
      return;
    }
    try {
      const baselinePaymentMethodId = paymentMethod?.id ?? null;
      const result = await createPaymentSetup.mutateAsync();
      if (!isActiveRef.current) return;
      if (result.clientSecret) {
        setSetupBaselinePaymentMethodId(baselinePaymentMethodId);
        setSetupSecret(result.clientSecret);
        return;
      }
      if (result.url) {
        openCheckoutUrl(result.url);
        return;
      }
      toast.error("Stripe did not return a setup session");
    } catch {
      // Mutation-level error feedback handles failed setup requests.
    }
  }

  async function saveAutoRecharge() {
    if (!autoValuesValid) {
      toast.error("Use $5 increments between $5 and $500");
      return;
    }
    if (!organizationId) {
      toast.error("Choose an organization before changing auto-recharge");
      return;
    }
    try {
      await updateAutoRecharge.mutateAsync({
        enabled: autoEnabled,
        thresholdCents: thresholdDollars * 100,
        amountCents: reloadDollars * 100,
      });
      if (!isActiveRef.current) return;
      setAutoDraft(null);
    } catch {
      // Mutation-level error feedback keeps the current draft available to retry.
    }
  }

  if (summary.isLoading) {
    return (
      <div className="space-y-5" aria-label="Loading billing">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (summary.isError) {
    return (
      <section className="border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold">Could not load wallet billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => summary.refetch()}
          disabled={summary.isFetching}
        >
          <RefreshCw
            className={summary.isFetching ? "animate-spin" : undefined}
          />
          Retry
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Prepaid wallet</h2>
              <Badge variant={isUnmetered ? "secondary" : "outline"}>
                {isUnmetered
                  ? "Self-hosted · unmetered"
                  : humanize(summary.data?.status ?? "active")}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Calls draw from promotional credit first, then paid balance. Phone
              numbers and renewals always require paid balance.
            </p>
          </div>
          {!isUnmetered ? (
            <p className="text-xs text-muted-foreground">
              Charges settle from actual usage; calls end before available
              credit runs out.
            </p>
          ) : null}
        </div>
      </section>

      {debtMicros > 0 ? (
        <div className="flex items-start gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              Outstanding balance: {formatMicros(debtMicros, currency)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Provider charges exceeded the final call reserve. Add paid credit
              to clear the balance before starting more calls.
            </p>
          </div>
        </div>
      ) : null}

      {!isUnmetered &&
      summary.data?.status &&
      !["active", "ok"].includes(summary.data.status.toLowerCase()) ? (
        <div className="flex items-start gap-3 border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">
              Billing is {humanize(summary.data.status).toLowerCase()}
            </p>
            <p className="mt-1 text-muted-foreground">
              Recharge the wallet to restore calling and protect rented phone
              numbers from release.
            </p>
          </div>
        </div>
      ) : null}

      {summary.data?.legacySubscription?.endsAt ? (
        <div className="border bg-muted/20 p-4 text-sm text-muted-foreground">
          Your existing subscription remains active until{" "}
          {formatDate(summary.data.legacySubscription.endsAt)}. Prepaid billing
          takes over after that date.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <BalanceCard
          icon={WalletCards}
          label="Available balance"
          amount={
            isUnmetered ? "Unmetered" : formatMicros(availableMicros, currency)
          }
          description="Available for connected call usage right now."
        />
        <BalanceCard
          icon={CreditCard}
          label="Paid credit"
          amount={isUnmetered ? "—" : formatMicros(paidMicros, currency)}
          description="Pays for calls, phone-number rental, renewals, and reconciled charges."
        />
        <BalanceCard
          icon={Gift}
          label="Promotional credit"
          amount={isUnmetered ? "—" : formatMicros(promotionalMicros, currency)}
          description="Pays for calls only. It cannot buy or renew phone numbers."
        />
      </div>

      {!isUnmetered && canManageBilling ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="border bg-card p-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Add credit</h2>
              <p className="text-sm text-muted-foreground">
                Top up between $5 and $500 in $5 increments.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-2">
              {TOP_UP_PRESETS.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={topUpDollars === amount ? "default" : "outline"}
                  onClick={() => changeTopUpAmount(amount)}
                  disabled={createCheckout.isPending}
                >
                  ${amount}
                </Button>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="top-up-amount">Custom amount (USD)</Label>
              <Input
                id="top-up-amount"
                type="number"
                min={MIN_RECHARGE_DOLLARS}
                max={MAX_RECHARGE_DOLLARS}
                step={5}
                value={topUpDollars}
                onChange={(event) =>
                  changeTopUpAmount(
                    Number.isNaN(event.target.valueAsNumber)
                      ? 0
                      : event.target.valueAsNumber,
                  )
                }
                disabled={createCheckout.isPending}
                aria-invalid={!topUpValid}
                aria-describedby="top-up-amount-help"
              />
              {!topUpValid ? (
                <p
                  id="top-up-amount-help"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  Enter a whole $5 increment from $5 to $500.
                </p>
              ) : (
                <p
                  id="top-up-amount-help"
                  className="text-xs text-muted-foreground"
                >
                  QuickVoice absorbs card-processing fees. Applicable tax is
                  extra.
                </p>
              )}
            </div>
            <Button
              className="mt-5 w-full"
              onClick={() => void beginTopUp()}
              disabled={
                !topUpValid ||
                createCheckout.isPending ||
                topUpConfirmation?.status === "processing" ||
                !isStripeClientConfigured
              }
            >
              {createCheckout.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <WalletCards />
              )}
              {createCheckout.isPending
                ? "Opening secure checkout…"
                : `Add $${topUpDollars}`}
            </Button>
            {topUpConfirmation ? (
              <div
                className={cn(
                  "mt-4 border p-3 text-xs",
                  topUpConfirmation.status === "processing"
                    ? "border-primary/30 bg-primary/5 text-muted-foreground"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200",
                )}
                role="status"
              >
                <div className="flex items-start gap-2">
                  {topUpConfirmation.status === "processing" ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      {topUpConfirmation.status === "processing"
                        ? "Payment is processing"
                        : "Confirmation is taking longer than expected"}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {topUpConfirmation.status === "processing"
                        ? "We are waiting for Stripe confirmation before showing the wallet credit."
                        : "The payment may still complete. Check again before starting another top-up; retries will not credit this payment twice."}
                    </p>
                    {topUpConfirmation.status === "timed-out" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void pollForTopUpConfirmation(
                            topUpConfirmation.topUpId,
                          )
                        }
                      >
                        <RefreshCw />
                        Check payment again
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {!isStripeClientConfigured ? (
              <p className="mt-3 text-xs text-destructive">
                Payments are unavailable because the Stripe publishable key is
                missing.
              </p>
            ) : null}
          </section>

          <section className="border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Payment method</h2>
                <p className="text-sm text-muted-foreground">
                  Used only for top-ups and auto-recharge you authorize.
                </p>
              </div>
              <ShieldCheck className="size-5 text-primary" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">
                  {paymentMethod?.brand && paymentMethod.last4
                    ? `${humanize(paymentMethod.brand)} •••• ${paymentMethod.last4}`
                    : hasPaymentMethod
                      ? "Saved payment method"
                      : "No payment method saved"}
                </p>
                {paymentMethod?.expMonth && paymentMethod.expYear ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expires {String(paymentMethod.expMonth).padStart(2, "0")}/
                    {paymentMethod.expYear}
                  </p>
                ) : null}
              </div>
              <Button
                variant="outline"
                onClick={() => void beginPaymentSetup()}
                disabled={
                  createPaymentSetup.isPending ||
                  paymentMethodConfirmation?.status === "processing" ||
                  !isStripeClientConfigured
                }
              >
                {createPaymentSetup.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                {hasPaymentMethod ? "Replace" : "Add card"}
              </Button>
            </div>

            {paymentMethodConfirmation ? (
              <div
                className={cn(
                  "mt-4 border p-3 text-xs",
                  paymentMethodConfirmation.status === "processing"
                    ? "border-primary/30 bg-primary/5 text-muted-foreground"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200",
                )}
                role="status"
              >
                <div className="flex items-start gap-2">
                  {paymentMethodConfirmation.status === "processing" ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      {paymentMethodConfirmation.status === "processing"
                        ? "Saving payment method"
                        : "Payment method confirmation timed out"}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {paymentMethodConfirmation.status === "processing"
                        ? "We are waiting for Stripe to confirm the saved payment method."
                        : "Stripe may still finish saving the card. Check again before submitting another card."}
                    </p>
                    {paymentMethodConfirmation.status === "timed-out" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void pollForPaymentMethodConfirmation(
                            paymentMethodConfirmation.expectedPaymentMethodId,
                            paymentMethodConfirmation.baselinePaymentMethodId,
                          )
                        }
                      >
                        <RefreshCw />
                        Check payment method again
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-4 border-t pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="auto-recharge">Automatic recharge</Label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Add credit when paid balance falls below your threshold.
                  </p>
                </div>
                <Switch
                  id="auto-recharge"
                  checked={autoEnabled}
                  onCheckedChange={(enabled) =>
                    setAutoDraft({
                      enabled,
                      thresholdDollars,
                      reloadDollars,
                    })
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recharge-threshold">Threshold (USD)</Label>
                  <Input
                    id="recharge-threshold"
                    type="number"
                    min={MIN_RECHARGE_DOLLARS}
                    max={MAX_RECHARGE_DOLLARS}
                    step={5}
                    value={thresholdDollars}
                    onChange={(event) =>
                      setAutoDraft({
                        enabled: autoEnabled,
                        thresholdDollars: Number.isNaN(
                          event.target.valueAsNumber,
                        )
                          ? 0
                          : event.target.valueAsNumber,
                        reloadDollars,
                      })
                    }
                    disabled={!autoEnabled}
                    aria-invalid={autoEnabled && !autoValuesValid}
                    aria-describedby={
                      autoEnabled && !autoValuesValid
                        ? "auto-recharge-error"
                        : undefined
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recharge-amount">Recharge amount (USD)</Label>
                  <Input
                    id="recharge-amount"
                    type="number"
                    min={MIN_RECHARGE_DOLLARS}
                    max={MAX_RECHARGE_DOLLARS}
                    step={5}
                    value={reloadDollars}
                    onChange={(event) =>
                      setAutoDraft({
                        enabled: autoEnabled,
                        thresholdDollars,
                        reloadDollars: Number.isNaN(event.target.valueAsNumber)
                          ? 0
                          : event.target.valueAsNumber,
                      })
                    }
                    disabled={!autoEnabled}
                    aria-invalid={autoEnabled && !autoValuesValid}
                    aria-describedby={
                      autoEnabled && !autoValuesValid
                        ? "auto-recharge-error"
                        : undefined
                    }
                  />
                </div>
              </div>
              {autoEnabled && !hasPaymentMethod ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Save a payment method before enabling automatic recharge.
                </p>
              ) : null}
              {!autoValuesValid ? (
                <p
                  id="auto-recharge-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  Use $5 increments between $5 and $500, with the recharge
                  amount greater than the threshold.
                </p>
              ) : null}
              <Button
                variant="outline"
                onClick={() => void saveAutoRecharge()}
                disabled={
                  updateAutoRecharge.isPending ||
                  !autoValuesValid ||
                  (autoEnabled && !hasPaymentMethod)
                }
              >
                {updateAutoRecharge.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                Save auto-recharge
              </Button>
            </div>
          </section>
        </div>
      ) : !isUnmetered ? (
        <section className="border bg-muted/20 p-5">
          <h2 className="text-sm font-semibold">
            Billing controls are read-only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organization owners and admins can add payment methods, top up the
            wallet, and configure automatic recharge. You can still view
            balances and transaction history.
          </p>
        </section>
      ) : null}

      <section className="overflow-hidden border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Transaction history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wallet credits, call charges, number rental, refunds, and
              adjustments.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => transactions.refetch()}
            disabled={transactions.isFetching}
          >
            <RefreshCw
              className={transactions.isFetching ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        </div>

        {transactions.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.isError ? (
          <div className="p-5 text-sm text-destructive">
            Transaction history could not be loaded.
          </div>
        ) : sortedTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <WalletCards className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No wallet activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Top-ups and usage charges will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Activity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="pr-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTransactions.map((transaction, index) => {
                const presentation = getTransactionPresentation(transaction);
                const TransactionIcon =
                  presentation.tone === "hold"
                    ? LockKeyhole
                    : presentation.tone === "release"
                      ? RotateCcw
                      : presentation.tone === "credit"
                        ? ArrowDownRight
                        : ArrowUpRight;
                return (
                  <TableRow
                    key={
                      transaction.id ??
                      transaction.transactionId ??
                      transaction.billingTransactionId ??
                      `${transaction.createdAt}-${index}`
                    }
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full",
                            presentation.tone === "credit" &&
                              "bg-emerald-500/10 text-emerald-600",
                            presentation.tone === "hold" &&
                              "bg-amber-500/10 text-amber-600",
                            presentation.tone === "release" &&
                              "bg-blue-500/10 text-blue-600",
                            presentation.tone === "danger" &&
                              "bg-destructive/10 text-destructive",
                            (presentation.tone === "debit" ||
                              presentation.tone === "neutral") &&
                              "bg-muted text-muted-foreground",
                          )}
                        >
                          <TransactionIcon className="size-4" />
                        </span>
                        <div className="min-w-0 whitespace-normal">
                          <p className="font-medium">{presentation.label}</p>
                          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                            {presentation.detail}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          presentation.tone === "hold" &&
                            "border-amber-500/30 text-amber-700 dark:text-amber-300",
                          presentation.tone === "release" &&
                            "border-blue-500/30 text-blue-700 dark:text-blue-300",
                          presentation.tone === "danger" &&
                            "border-destructive/30 text-destructive",
                        )}
                      >
                        {presentation.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(transaction.createdAt)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-5 text-right font-mono font-medium",
                        presentation.tone === "credit" && "text-emerald-600",
                        presentation.tone === "hold" && "text-amber-600",
                        presentation.tone === "release" && "text-blue-600",
                        presentation.tone === "danger" && "text-destructive",
                        (presentation.tone === "debit" ||
                          presentation.tone === "neutral") &&
                          "text-foreground",
                      )}
                    >
                      {presentation.amountPrefix}
                      {formatMicros(presentation.amountMicros, currency)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <TopUpCheckoutDialog
        clientSecret={checkoutSecret}
        amountCents={checkoutAmountCents}
        onClose={() => {
          setCheckoutSecret(null);
          setCheckoutTopUpId(null);
        }}
        onComplete={onCheckoutComplete}
      />
      <PaymentMethodSetupDialog
        clientSecret={setupSecret}
        onClose={() => {
          setSetupSecret(null);
          setSetupBaselinePaymentMethodId(null);
        }}
        onComplete={onSetupComplete}
      />
    </div>
  );
}
