"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MapPin, Phone, PhoneCall, Search, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { useBuyNumber, useNumberSearch } from "@/src/hooks/queries/numbers";
import type { NumberSearchParams } from "@/src/lib/api/resources/numbers";
import type { AvailableNumber } from "@/src/lib/api/types";

const schema = z.object({
  provider: z.enum(["TWILIO", "TELNYX"]),
  country: z.string().length(2, "ISO-3166 alpha-2 country code").toUpperCase(),
  areaCode: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
const monthlyPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMonthlyPrice(value: AvailableNumber["monthlyPriceMicros"]) {
  if (value === null || value === undefined) return null;
  const micros = Number(value);
  if (!Number.isFinite(micros)) return null;
  return monthlyPriceFormatter.format(micros / 1_000_000);
}

function quoteExpiryMs(value: string) {
  const expiryMs = Date.parse(value);
  return Number.isFinite(expiryMs) ? expiryMs : null;
}

function isQuoteExpired(value: string, nowMs: number) {
  const expiryMs = quoteExpiryMs(value);
  return expiryMs === null || expiryMs <= nowMs;
}

export function BuyNumberDrawer() {
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useState<NumberSearchParams | null>(
    null,
  );
  const [buyingNumber, setBuyingNumber] = useState<string | null>(null);
  const [quoteClock, setQuoteClock] = useState(() => Date.now());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { provider: "TWILIO", country: "US", areaCode: "" },
  });
  const watchedProvider = useWatch({ control: form.control, name: "provider" });
  const watchedCountry = useWatch({ control: form.control, name: "country" });
  const watchedAreaCode = useWatch({ control: form.control, name: "areaCode" });

  const search = useNumberSearch(searchParams, !!searchParams);
  const buy = useBuyNumber();

  useEffect(() => {
    if (!open || !search.data?.length) return;
    const nextExpiry = search.data.reduce<number | null>((next, number) => {
      const expiryMs = quoteExpiryMs(number.quoteExpiresAt);
      if (expiryMs === null || expiryMs <= quoteClock) return next;
      return next === null || expiryMs < next ? expiryMs : next;
    }, null);
    if (nextExpiry === null) return;

    const timeout = window.setTimeout(
      () => setQuoteClock(Date.now()),
      Math.max(0, nextExpiry - Date.now() + 25),
    );
    return () => window.clearTimeout(timeout);
  }, [open, quoteClock, search.data]);

  function onSubmit(values: FormValues) {
    setQuoteClock(Date.now());
    setSearchParams({
      provider: values.provider,
      country: values.country,
      areaCode: values.areaCode || undefined,
      limit: 12,
    });
  }

  async function onBuy(number: AvailableNumber) {
    if (!searchParams) return;
    const nowMs = Date.now();
    if (isQuoteExpired(number.quoteExpiresAt, nowMs)) {
      setQuoteClock(nowMs);
      toast.error("Quote expired. Search again for current pricing.");
      return;
    }
    setBuyingNumber(number.phoneNumber);
    try {
      await buy.mutateAsync({
        provider: searchParams.provider,
        phoneNumber: number.phoneNumber,
        quoteId: number.quoteId,
      });
      setOpen(false);
      form.reset();
      setSearchParams(null);
    } finally {
      setBuyingNumber(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus /> Buy number
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[min(94vw,940px)] data-[side=right]:sm:max-w-none">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Buy a phone number</SheetTitle>
          <SheetDescription>
            Search available numbers from your telephony provider and purchase
            one for this organization.
          </SheetDescription>
        </SheetHeader>

        <div className="border-b bg-muted/20 px-6 py-5">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid gap-4 md:grid-cols-[1fr_0.8fr_0.8fr_auto] md:items-end"
            >
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Provider</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TWILIO">Twilio</SelectItem>
                        <SelectItem value="TELNYX">Telnyx</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={2}
                        placeholder="US"
                        {...field}
                        onChange={(event) =>
                          field.onChange(event.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      ISO 3166-1 alpha-2, e.g. US, GB, IN
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="areaCode"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Area code</FormLabel>
                    <FormControl>
                      <Input placeholder="415" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={search.isFetching}
                className="w-full lg:w-auto"
              >
                {search.isFetching ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Search />
                )}
                Search
              </Button>
            </form>
          </Form>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b bg-muted/10 px-6 py-5 lg:border-r lg:border-b-0">
            <div className="rounded-xl border bg-background p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">
                Search criteria
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Provider
                  </dt>
                  <dd className="mt-1 capitalize text-foreground">
                    {watchedProvider}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Country
                  </dt>
                  <dd className="mt-1 font-mono text-foreground">
                    {watchedCountry}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Area code
                  </dt>
                  <dd className="mt-1 font-mono text-foreground">
                    {watchedAreaCode || "Any"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Phone numbers start at $2 per 30 days. Promotional credit cannot
                buy or renew numbers; rental is charged from paid credit.
              </p>
            </div>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!searchParams ? (
              <EmptyState
                icon={Phone}
                title="Search available numbers"
                description="Pick a provider, country, and optional area code."
                className="border-0"
              />
            ) : search.isFetching ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : search.isError ? (
              <EmptyState
                icon={Phone}
                title="Search failed"
                description="Check the provider and country, then try again."
                className="border-0"
              />
            ) : !search.data?.length ? (
              <EmptyState
                icon={Phone}
                title="No numbers found"
                description="Try a different country or area code."
                className="border-0"
              />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {search.data.map((n) => {
                  const monthlyPrice = formatMonthlyPrice(n.monthlyPriceMicros);
                  const quoteExpired = isQuoteExpired(
                    n.quoteExpiresAt,
                    quoteClock,
                  );
                  return (
                    <div
                      key={n.phoneNumber}
                      className="rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500">
                          <PhoneCall className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-base font-semibold text-foreground">
                            {n.phoneNumber}
                          </p>
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {[n.locality, n.region, n.isoCountry]
                              .filter(Boolean)
                              .join(" · ") || "Location unavailable"}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-foreground">
                            {monthlyPrice ?? "Price confirmed before purchase"}
                            {monthlyPrice ? (
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                / 30 days
                              </span>
                            ) : null}
                          </p>
                          {quoteExpired ? (
                            <p
                              className="mt-1 text-[11px] font-medium text-destructive"
                              role="alert"
                            >
                              Quote expired — search again
                            </p>
                          ) : n.quoteExpiresAt ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Quote expires{" "}
                              {new Date(n.quoteExpiresAt).toLocaleTimeString(
                                [],
                                { hour: "numeric", minute: "2-digit" },
                              )}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onBuy(n)}
                        disabled={buy.isPending || quoteExpired}
                        className="mt-4 w-full"
                      >
                        {quoteExpired ? (
                          "Quote expired — search again"
                        ) : buyingNumber === n.phoneNumber ? (
                          <>
                            <Loader2 className="animate-spin" /> Buying…
                          </>
                        ) : monthlyPrice ? (
                          `Buy for ${monthlyPrice}`
                        ) : (
                          "Buy this number"
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
