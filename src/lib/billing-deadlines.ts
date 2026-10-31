export interface BillingDeadline extends Record<string, unknown> {
  from: string;
  discount: number | null;
  createBill: boolean;
  sendBill: boolean;
  isRenewal: boolean;
  comment?: string;
  validFrom?: string;
  validTo?: string;
}
export function monthDay(value: string): string | undefined {
  const stored = /^(\d{2})-(\d{2})$/.exec(value);
  const display = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(value.trim());
  const month = stored ? Number(stored[1]) : display ? Number(display[2]) : 0;
  const day = stored ? Number(stored[2]) : display ? Number(display[1]) : 0;
  const date = new Date(Date.UTC(2000, month - 1, day));
  if (
    !month ||
    !day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function displayMonthDay(value: string) {
  return /^\d{2}-\d{2}$/.test(value)
    ? `${Number(value.slice(3))}.${Number(value.slice(0, 2))}.`
    : value;
}
export function annualDay(value: string) {
  const normalized = monthDay(value);
  return normalized
    ? (Date.parse(`2000-${normalized}T00:00:00Z`) - Date.UTC(2000, 0, 1)) /
        86400000
    : undefined;
}
/** Normalize user-facing day/month inputs without persisting API-generated boundaries. */
export function normalizeDeadlines(value: unknown): BillingDeadline[] {
  if (!Array.isArray(value))
    throw Error('Billing deadlines: enter a list of deadlines.');
  const seen = new Set<string>();
  return value.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source))
      throw Error('Billing deadlines: invalid deadline.');
    const row = { ...source };
    delete row.toExcluded;
    const fail = () =>
      Error(
        `Billing deadlines: check dates, discount (0–100%) and options for deadline ${index + 1}.`,
      );
    const from = typeof row.from === 'string' && monthDay(row.from);
    if (
      !from ||
      seen.has(from) ||
      typeof row.discount !== 'number' ||
      !Number.isFinite(row.discount) ||
      row.discount < 0 ||
      row.discount > 100 ||
      ['createBill', 'sendBill', 'isRenewal'].some(
        (key) => typeof row[key] !== 'boolean',
      )
    )
      throw fail();
    seen.add(from);
    row.from = from;
    for (const key of ['validFrom', 'validTo']) {
      if (row[key] === undefined || row[key] === '') {
        delete row[key];
        continue;
      }
      const normalized = typeof row[key] === 'string' && monthDay(row[key]);
      if (!normalized) throw fail();
      row[key] = normalized;
    }
    if (row.validFrom && row.validTo && row.validFrom > row.validTo)
      throw fail();
    return row as BillingDeadline;
  });
}
