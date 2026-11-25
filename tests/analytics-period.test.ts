import { describe, expect, it } from 'vitest';
import { parseAnalyticsPeriod } from '../src/server/routes/analytics.routes';

describe('analytics period parsing', () => {
  it('accepts all-time and bounds numeric ranges', () => {
    expect(parseAnalyticsPeriod('all')).toBe('all');
    expect(parseAnalyticsPeriod('1')).toBe(1);
    expect(parseAnalyticsPeriod('999')).toBe(365);
  });

  it('uses the 30-day default for invalid ranges', () => {
    expect(parseAnalyticsPeriod(undefined)).toBe(30);
    expect(parseAnalyticsPeriod('not-a-period')).toBe(30);
  });
});
