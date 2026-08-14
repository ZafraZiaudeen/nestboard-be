import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripe } from "../lib/stripe.js";
import { env } from "../lib/env.js";
import * as svc from "../services/booking-service.js";
import { logger } from "../lib/logger.js";

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.error(`Webhook error: ${(err as Error).message}`);
    res.status(400).send(`Webhook error: ${(err as Error).message}`);
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;
      if (bookingId) await svc.confirmBookingFromWebhook(bookingId, session.id);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;
      if (bookingId) await svc.expireBookingFromWebhook(bookingId);
      break;
    }
  }

  res.json({ received: true });
}
