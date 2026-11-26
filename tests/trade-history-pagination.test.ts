import { describe, expect, it } from 'vitest';
import { paginateRows } from '../src/client/pages/app/trade-history-pagination';

describe('trade history pagination', () => {
  it('keeps every trade reachable across pages without changing the full result count', () => {
    const allTrades = Array.from({ length: 79 }, (_, index) => `trade-${index + 1}`);
    const first = paginateRows(allTrades, 1);
    const second = paginateRows(allTrades, 2);
    const third = paginateRows(allTrades, 3);

    expect(first).toMatchObject({ page: 1, totalPages: 4, start: 1, end: 25 });
    expect(second.rows).toHaveLength(25);
    expect(third).toMatchObject({ page: 3, totalPages: 4, start: 51, end: 75 });
    expect([...first.rows, ...second.rows, ...third.rows, ...paginateRows(allTrades, 4).rows]).toEqual(allTrades);
  });

  it('clamps a page after filtering and handles an empty history', () => {
    expect(paginateRows(['remaining'], 4)).toMatchObject({
      rows: ['remaining'],
      page: 1,
      totalPages: 1,
      start: 1,
      end: 1,
    });
    expect(paginateRows([], 1)).toMatchObject({
      rows: [],
      page: 1,
      totalPages: 1,
      start: 0,
      end: 0,
    });
  });
});
