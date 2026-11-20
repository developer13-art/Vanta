// Versioned rate card. Bump version when rates change. Existing ledger rows
// keep their rate_version so history is auditable.

export const RATE_VERSION = 'v1-2026-11';

export const PACKAGES = {
  starter:  { credits: 100,   price: 8,    currency: 'USD', priceNgn: 12_000 },
  basic:    { credits: 250,   price: 18,   currency: 'USD', priceNgn: 27_000 },
  trader:   { credits: 500,   price: 32,   currency: 'USD', priceNgn: 48_000 },
  pro:      { credits: 1_000, price: 56,   currency: 'USD', priceNgn: 84_000 },
  advanced: { credits: 2_500, price: 125,  currency: 'USD', priceNgn: 187_500 },
  expert:   { credits: 5_000, price: 225,  currency: 'USD', priceNgn: 337_500 },
  elite:    { credits: 10_000,price: 400,  currency: 'USD', priceNgn: 600_000 },
} as const;

export type PackageCode = keyof typeof PACKAGES;

export const RATES = {
  openOrder: 2,
  closeOrder: 2,
  aiAssessment: 2,
} as const;

export const LOW_BALANCE_THRESHOLDS = {
  info: 0.50,
  warn: 0.20,
  critical: 0.10,
} as const;