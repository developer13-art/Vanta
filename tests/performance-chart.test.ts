import { describe, expect, it } from 'vitest';
import { formatDailyPnlDate } from '../src/client/pages/app/Performance';

describe('performance chart date formatting', () => {
  it('formats database timestamp dates without producing Invalid Date', () => {
    const formatted = formatDailyPnlDate(
      '2026-11-25T00:00:00.000Z',
      { year: 'numeric', month: '2-digit', day: '2-digit' },
    );

    expect(formatted).toBe(new Date(2026, 10, 25).toLocaleDateString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }));
  });

  it('handles malformed dates without exposing Invalid Date', () => {
    expect(formatDailyPnlDate('not-a-date')).toBe('—');
  });
});
