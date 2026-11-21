import type { Account } from "../../api/endpoints/accounting";

/** 121 الأموال الجاهزة والنقدية — treasuries and banks (backend `AccountTree::subtreeIds('121')`). */
export const TREASURY_ROOT_CODE = "121";

/** CR 8: bank accounts live under 1212; a cash box is never linked there. */
export const BANK_ROOT_CODE = "1212";

/** 1215 سلف الموظفين — lines in this subtree carry the employee (backend `EmployeeAdvanceAccounts`). */
export const EMPLOYEE_ADVANCES_ROOT_CODE = "1215";

/**
 * Ids of the account with this code and every descendant, walked by
 * parent_account_id like the backend's `AccountTree::subtreeIds`. Codes are
 * not a reliable guide: 1214 and 1215 keep their codes but sit under 12, not
 * under the treasury node 121 (W5-00).
 */
export function accountSubtreeIds(accounts: Account[], rootCode: string): Set<string> {
  const root = accounts.find((a) => a.account_code === rootCode);
  const ids = new Set<string>();
  if (!root) return ids;
  const children = new Map<string, string[]>();
  for (const a of accounts) {
    if (!a.parent_account_id) continue;
    const list = children.get(a.parent_account_id) ?? [];
    list.push(a.id);
    children.set(a.parent_account_id, list);
  }
  const frontier = [root.id];
  while (frontier.length > 0) {
    const id = frontier.pop() as string;
    if (ids.has(id)) continue;
    ids.add(id);
    frontier.push(...(children.get(id) ?? []));
  }
  return ids;
}

/**
 * Strict picker filter for purchase-order payment source accounts.
 *
 * Restricts the dropdown to asset leaves in the 121 subtree — the chart's
 * cash/bank node (الأموال الجاهزة والنقدية), walked by parent_account_id. This
 * matches the seed at `database/seeders/ChartOfAccountsSeeder.php` and
 * prevents an operator from accidentally posting a payment against, say,
 * a fixed-asset sub-account or the employee advances moved out to 12.
 *
 * Returns accounts ordered as the chart presents them (parent-first is
 * already how `useAccounts` returns them).
 */
export function filterPaymentSourceAccounts(accounts: Account[]): Account[] {
  const treasuryIds = accountSubtreeIds(accounts, TREASURY_ROOT_CODE);
  return leafAccounts(accounts).filter((a) => a.type === "asset" && treasuryIds.has(a.id));
}

/**
 * Frozen itself or under a frozen ancestor (ACC-14) — the backend refuses
 * postings and new links to it.
 */
export function isFrozenAccount(account: Account, accounts: Account[]): boolean {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const seen = new Set<string>();
  let current: Account | undefined = account;
  while (current && !seen.has(current.id)) {
    if (current.status === "frozen") return true;
    seen.add(current.id);
    current = current.parent_account_id ? byId.get(current.parent_account_id) : undefined;
  }
  return false;
}

/**
 * Accounts that can take a posting or a link: active accounts with no
 * sub-accounts. The backend refuses headers (BR-GL-001) and frozen accounts
 * (ACC-14), so pickers should not offer them.
 * `allowedHeaderCodes` keeps specific headers selectable (the receivable root
 * 122 takes client-tagged manual lines by design). `keepIds` keeps an
 * already-linked account visible even if it has since been frozen, so an
 * existing form still shows what it holds.
 */
export function leafAccounts(
  accounts: Account[],
  allowedHeaderCodes: string[] = [],
  keepIds: (string | null | undefined)[] = [],
): Account[] {
  const parents = new Set(accounts.map((a) => a.parent_account_id).filter(Boolean));
  const keep = new Set(keepIds.filter(Boolean));
  return accounts.filter(
    (a) =>
      (!parents.has(a.id) || allowedHeaderCodes.includes(a.account_code)) &&
      (keep.has(a.id) || !isFrozenAccount(a, accounts)),
  );
}
