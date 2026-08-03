"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null;

export const isStripeClientConfigured = Boolean(stripePublishableKey);
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatUsd(cents: number) {
  return usdFormatter.format(cents / 100);
}

export function TopUpCheckoutDialog({
  clientSecret,
  amountCents,
  onClose,
  onComplete,
}: {
  clientSecret: string | null;
  amountCents: number;
  onClose: () => void;
  onComplete: () => void;
}) {
  const options = useMemo(
    () => ({ clientSecret, onComplete }),
    [clientSecret, onComplete],
  );

  return (
    <Dialog
      open={Boolean(clientSecret)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pt-6 pb-5">
          <DialogTitle>Add {formatUsd(amountCents)} to your wallet</DialogTitle>
          <DialogDescription>
            Complete payment securely with Stripe. The full selected amount is
            credited after payment confirmation; applicable tax may be added.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-80 px-2 pb-4 sm:px-5">
          {clientSecret && stripePromise ? (
            <EmbeddedCheckoutProvider
              key={clientSecret}
              stripe={stripePromise}
              options={options}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupPaymentMethodForm({
  onComplete,
}: {
  onComplete: (paymentMethodId: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (result.error) {
        toast.error(result.error.message ?? "Could not save this card");
        return;
      }

      const paymentMethod = result.setupIntent?.payment_method;
      onComplete(
        typeof paymentMethod === "string"
          ? paymentMethod
          : (paymentMethod?.id ?? null),
      );
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not save this card",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      <DialogFooter>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitting ? "Saving…" : "Save payment method"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PaymentMethodSetupDialog({
  clientSecret,
  onClose,
  onComplete,
}: {
  clientSecret: string | null;
  onClose: () => void;
  onComplete: (paymentMethodId: string | null) => void;
}) {
  return (
    <Dialog
      open={Boolean(clientSecret)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save a payment method</DialogTitle>
          <DialogDescription>
            Stripe stores your card securely. QuickVoice uses it only for
            top-ups you start and automatic recharges you enable.
          </DialogDescription>
        </DialogHeader>
        {clientSecret && stripePromise ? (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe" },
            }}
          >
            <SetupPaymentMethodForm onComplete={onComplete} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
