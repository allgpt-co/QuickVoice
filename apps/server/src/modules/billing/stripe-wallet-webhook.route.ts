import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type Stripe from "stripe";

type StripeWalletWebhookDependencies = {
  constructEvent?: (
    payload: Buffer,
    signature: string,
    secret: string,
  ) => Stripe.Event | Promise<Stripe.Event>;
  getWebhookSecret?: () => string | undefined;
  isHostedBilling?: () => boolean | Promise<boolean>;
  processEvent?: (event: Stripe.Event) => Promise<void>;
};

export const stripeWalletWebhookRawBody = express.raw({
  type: "application/json",
});

export function createStripeWalletWebhookHandler(
  dependencies: StripeWalletWebhookDependencies = {},
): RequestHandler {
  const constructEvent = dependencies.constructEvent ?? constructStripeEvent;
  const getWebhookSecret =
    dependencies.getWebhookSecret ??
    (() => process.env.STRIPE_WALLET_WEBHOOK_SECRET?.trim());
  const hostedBilling =
    dependencies.isHostedBilling ?? currentHostedBillingMode;
  const processEvent = dependencies.processEvent ?? processWalletEvent;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(await hostedBilling())) {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Route not found",
      });
      return;
    }

    const secret = getWebhookSecret();
    if (!secret) {
      res.status(503).json({
        success: false,
        code: "STRIPE_WALLET_WEBHOOK_NOT_CONFIGURED",
        message: "Stripe wallet webhook is not configured",
      });
      return;
    }

    const signature = req.header("stripe-signature")?.trim();
    if (!signature) {
      res.status(400).json({
        success: false,
        code: "STRIPE_SIGNATURE_REQUIRED",
        message: "Stripe-Signature header is required",
      });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({
        success: false,
        code: "STRIPE_RAW_BODY_REQUIRED",
        message: "Stripe webhook requires an application/json raw body",
      });
      return;
    }

    let event: Stripe.Event;
    try {
      event = await constructEvent(req.body, signature, secret);
    } catch {
      res.status(400).json({
        success: false,
        code: "INVALID_STRIPE_SIGNATURE",
        message: "Stripe webhook signature verification failed",
      });
      return;
    }

    try {
      await processEvent(event);
      res.status(200).json({ success: true, received: true });
    } catch (error) {
      next(error);
    }
  };
}

export const stripeWalletWebhookHandler = createStripeWalletWebhookHandler();

async function constructStripeEvent(
  payload: Buffer,
  signature: string,
  secret: string,
) {
  const { stripeClient } = await import("../../config/stripe.js");
  return stripeClient.webhooks.constructEventAsync(payload, signature, secret);
}

async function processWalletEvent(event: Stripe.Event) {
  const { processStripeWalletEvent } =
    await import("./stripe-wallet.service.js");
  await processStripeWalletEvent(event);
}

async function currentHostedBillingMode() {
  const { isHostedBilling } = await import("../../config/billing-mode.js");
  return isHostedBilling;
}
