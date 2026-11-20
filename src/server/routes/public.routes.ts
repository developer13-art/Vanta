import { Router } from 'express';
import { PACKAGES, RATES } from '../credit-rates';

export const publicRouter = Router();

publicRouter.get('/packages', (_req, res) => {
  res.json(
    Object.entries(PACKAGES).map(([code, pkg]) => ({
      code, credits: pkg.credits, priceUsd: pkg.price, priceNgn: pkg.priceNgn,
    })),
  );
});

publicRouter.get('/rates', (_req, res) => {
  res.json({
    openOrder: RATES.openOrder,
    closeOrder: RATES.closeOrder,
    aiAssessment: RATES.aiAssessment,
  });
});

publicRouter.get('/faq', (_req, res) => {
  res.json([
    { q: 'Do I need to keep my PC running?', a: 'No. VANTA runs in the cloud and connects to your broker through MetaApi.' },
    { q: 'Which brokers are supported?', a: 'Any broker that offers MT4 or MT5 and supports MetaApi connectivity.' },
    { q: 'Can I test without risking money?', a: 'Yes. Demo accounts are fully supported and recommended first.' },
    { q: 'How are credits charged?', a: '2 credits per individual order open, 2 per individual close, 2 per AI assessment.' },
    { q: 'What happens when my wallet hits zero?', a: 'New billable entries are blocked; existing positions stay in management-only safety mode.' },
    { q: 'Can the AI place trades on its own?', a: 'AI produces bounded decisions; an independent risk engine verifies every proposal.' },
    { q: 'Do you take custody of funds?', a: 'No. Your capital stays in your own broker account. No withdrawal permission is requested.' },
    { q: 'Are profits guaranteed?', a: 'No. Trading involves substantial risk. Past performance does not guarantee future results.' },
  ]);
});