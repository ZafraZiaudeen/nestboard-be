import { Router } from "express";
import * as ctrl from "../controllers/stripe-webhook-controller.js";

export const stripeWebhookRouter: Router = Router();
stripeWebhookRouter.post("/", ctrl.handleStripeWebhook);
