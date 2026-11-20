import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { extname, resolve } from 'node:path';
import { env } from './env';
import { requestId, errorHandler, notFoundHandler, generalRateLimit } from './middleware';
import { logger } from './logger';

import { authRouter } from './routes/auth.routes';
import { brokerRouter } from './routes/broker.routes';
import { botRouter } from './routes/bot.routes';
import { walletRouter } from './routes/wallet.routes';
import { notificationRouter } from './routes/notification.routes';
import { settingsRouter } from './routes/settings.routes';
import { marketRouter } from './routes/market.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { adminRouter } from './routes/admin.routes';
import { paymentRouter } from './routes/payment.routes';
import { healthCheck } from './db';

import { positionRouter } from './routes/position.routes';
import { historyRouter } from './routes/history.routes';
import { publicRouter } from './routes/public.routes';

export function buildApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.APP_BASE_URL, credentials: true }));
  app.use(compression());
  app.use(requestId);

  // Webhook route must come BEFORE json() so raw body is preserved
  app.use('/api/payments', paymentRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(generalRateLimit);

  app.get('/health', async (_req, res) => {
    const db = await healthCheck();
    res.status(db ? 200 : 503).json({ db, ts: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/brokers', brokerRouter);
  app.use('/api/bots', botRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/positions', positionRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/public', publicRouter);

  if (env.NODE_ENV === 'production') {
    const clientDist = resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/') || extname(req.path)) return next();
      res.sendFile(resolve(clientDist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app built');
  return app;
}