export const TRADE_HISTORY_PAGE_SIZE = 25;

export function paginateRows<T>(
  rows: T[],
  requestedPage: number,
  pageSize = TRADE_HISTORY_PAGE_SIZE,
): { rows: T[]; page: number; totalPages: number; start: number; end: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize),
    page,
    totalPages,
    start: rows.length === 0 ? 0 : offset + 1,
    end: Math.min(offset + pageSize, rows.length),
  };
}
