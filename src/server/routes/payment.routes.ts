import { Router, raw } from 'express';
import { verifyWebhookSignature, handleWebhookEvent } from '../paystack';
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
      if (!verifyWebhookSignature(body, signature)) {
        logger.warn({ ip: req.ip }, 'Invalid webhook signature');
        throw Errors.unauthorized('Invalid signature');
      }
      await handleWebhookEvent(body);
      res.status(200).json({ ok: true });
    } catch (err) { next(err); }
  },
);