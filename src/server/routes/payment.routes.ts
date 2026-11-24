import { Router, raw } from 'express';
import {
  handleFlutterwaveWebhook,
  handlePaystackWebhook,
  handleStripeWebhook,
  verifyFlutterwaveWebhook,
  verifyPaystackWebhook,
  verifyStripeWebhook,
} from '../payments';
import { Errors } from '../errors';
import { logger } from '../logger';

export const paymentRouter = Router();

// IMPORTANT: raw body middleware — must be applied only to this route
paymentRouter.post(
  '/webhook/paystack',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res, next) => {
    try {
      const signature = req.header('x-paystack-signature');
      const body = req.body as Buffer;
      if (!verifyPaystackWebhook(body, signature)) {
        logger.warn({ ip: req.ip }, 'Invalid webhook signature');
        throw Errors.unauthorized('Invalid signature');
      }
      await handlePaystackWebhook(body);
      res.status(200).json({ ok: true });
    } catch (err) { next(err); }
  },
);

paymentRouter.post(
  '/webhook/flutterwave',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res, next) => {
    try {
      if (!verifyFlutterwaveWebhook(req.header('verif-hash'))) {
        logger.warn({ ip: req.ip }, 'Invalid Flutterwave webhook signature');
        throw Errors.unauthorized('Invalid signature');
      }
      await handleFlutterwaveWebhook(req.body as Buffer);
      res.status(200).json({ ok: true });
    } catch (err) { next(err); }
  },
);

paymentRouter.post(
  '/webhook/stripe',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res, next) => {
    try {
      if (!verifyStripeWebhook(req.body as Buffer, req.header('stripe-signature'))) {
        logger.warn({ ip: req.ip }, 'Invalid Stripe webhook signature');
        throw Errors.unauthorized('Invalid signature');
      }
      await handleStripeWebhook(req.body as Buffer);
      res.status(200).json({ ok: true });
    } catch (err) { next(err); }
  },
);