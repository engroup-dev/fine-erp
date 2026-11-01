/** The slice of a Laravel paginator response the walk needs. */
export interface PaginatedPage<T> {
  data: T[];
  last_page: number;
}

/** Rows per request: the inventory items endpoint caps per_page at 100. */
export const FETCH_ALL_PER_PAGE = 100;

/** Stops a runaway walk (a paginator that never reports its end). */
const MAX_PAGES = 1000;

/**
 * Every row of a paginated list endpoint: requests page 1..last_page in order with
 * the caller's filters and concatenates `data`. A row that shifts onto the next page
 * while the walk runs (a new record pushed it down) is kept once, by `id`.
 */
export async function fetchAllPages<T extends { id: string | number }>(
  fetchPage: (page: number, perPage: number) => Promise<PaginatedPage<T>>,
  perPage = FETCH_ALL_PER_PAGE,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string | number>();
  let lastPage = 1;
  for (let page = 1; page <= lastPage && page <= MAX_PAGES; page++) {
    const res = await fetchPage(page, perPage);
    for (const row of res.data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    lastPage = res.last_page;
  }
  return rows;
}
