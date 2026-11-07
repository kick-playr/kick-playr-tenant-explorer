import { Field } from '../ui';
import {
  annualDay,
  displayMonthDay,
  monthDay,
  normalizeDeadlines,
  type BillingDeadline,
} from '../../lib/billing-deadlines';
import type { SettingsSectionProps } from './types';
function ContributionChart({ rows }: { rows: BillingDeadline[] }) {
  let valid: BillingDeadline[];
  try {
    valid = normalizeDeadlines(rows).sort(
      (a, b) => annualDay(a.from)! - annualDay(b.from)!,
    );
  } catch {
    return (
      <p className="muted">
        Complete valid deadline dates and discounts to preview the contribution
        chart.
      </p>
    );
  }
  if (!valid.length) return null;
  const x = (day: number) => 48 + (day / 366) * 540,
    y = (percent: number) => 140 - percent * 1.1;
  let previous = 100 - valid[valid.length - 1]!.discount!;
  const points: [number, number][] = [[x(0), y(previous)]];
  for (const row of valid) {
    const day = annualDay(row.from)!;
    points.push([x(day), y(previous)]);
    previous = 100 - row.discount!;
    points.push([x(day), y(previous)]);
  }
  points.push([x(366), y(previous)]);
  const path = points.map(([a, b], i) => `${i ? 'L' : 'M'}${a},${b}`).join(' ');
  return (
    <figure className="deadline-chart">
      <svg
        viewBox="0 0 610 174"
        role="img"
        aria-label="Annual membership contribution after discount"
      >
        <title>Annual membership contribution after discount</title>
        <desc>
          {valid
            .map(
              (row) =>
                `${displayMonthDay(row.from)}: ${100 - row.discount!}% contribution${row.isRenewal ? ' (renewal)' : ''}`,
            )
            .join('; ')}
        </desc>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1="48" x2="588" y1={y(p)} y2={y(p)} stroke="var(--line)" />
            <text x="42" y={y(p) + 3} textAnchor="end">
              {p}
            </text>
          </g>
        ))}
        <path
          d={`${path} L588,140 L48,140 Z`}
          fill="var(--accent)"
          opacity="0.2"
        />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, m) => (
          <text
            key={m}
            x={x((Date.UTC(2000, m, 15) - Date.UTC(2000, 0, 1)) / 86400000)}
            y="158"
            textAnchor="middle"
          >
            {
              [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
              ][m]
            }
          </text>
        ))}
        <text transform="translate(12,86) rotate(-90)" textAnchor="middle">
          % contribution
        </text>
      </svg>
      <figcaption>
        {valid
          .filter((r) => r.isRenewal)
          .map((r) => `Renewal: ${displayMonthDay(r.from)}`)
          .join(' · ') || 'Contribution after discount throughout the year'}
      </figcaption>
    </figure>
  );
}
export function BillingSettings({
  draft,
  onChange,
  disabled,
}: SettingsSectionProps) {
  let rows: BillingDeadline[] = [],
    invalid = false;
  try {
    const parsed = JSON.parse(draft.cutOffDates || '[]');
    if (
      !Array.isArray(parsed) ||
      parsed.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
    )
      throw Error();
    rows = parsed;
  } catch {
    invalid = true;
  }
  const save = (items: BillingDeadline[]) =>
    onChange('cutOffDates', JSON.stringify(items, null, 2));
  const update = (index: number, patch: Record<string, unknown>) =>
    save(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const date = (
    index: number,
    key: 'from' | 'validFrom' | 'validTo',
    label: string,
  ) => (
    <Field label={`${label} for deadline ${index + 1}`}>
      <input
        type="text"
        placeholder="D.M."
        value={displayMonthDay(String(rows[index]?.[key] ?? ''))}
        onChange={(e) => update(index, { [key]: e.target.value })}
        onBlur={(e) => {
          const normalized = monthDay(e.target.value);
          if (normalized) update(index, { [key]: normalized });
        }}
      />
    </Field>
  );
  return (
    <section
      className="settings-group billing-deadlines"
      aria-label="Billing deadlines"
    >
      <h3>Billing deadlines</h3>
      <p className="muted">
        Set the membership discount for each joining period and whether invoices
        are created and sent.
      </p>
      {invalid ? (
        <>
          <p role="alert">
            The deadline data could not be read. Repair it before editing
            deadlines.
          </p>
          <Field label="Billing deadlines">
            <textarea
              value={draft.cutOffDates ?? ''}
              onChange={(e) => onChange('cutOffDates', e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <ContributionChart rows={rows} />
          {rows.length === 0 && <p>No billing deadlines configured.</p>}
          {rows.map((row, index) => (
            <fieldset disabled={disabled} className="deadline-card" key={index}>
              <legend>
                {row.comment || String(row.comments || `Deadline ${index + 1}`)}
              </legend>
              <div className="deadline-row">
                <strong>Comment / title</strong>
                <Field label={`Comment / title for deadline ${index + 1}`}>
                  <input
                    value={row.comment ?? String(row.comments ?? '')}
                    onChange={(e) => update(index, { comment: e.target.value })}
                  />
                </Field>
              </div>
              <div className="deadline-row">
                <strong>Discount</strong>
                <div className="operational-pair">
                  {date(index, 'from', 'Discount starts')}
                  <Field label={`Discount (%) for deadline ${index + 1}`}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={row.discount ?? ''}
                      onChange={(e) =>
                        update(index, {
                          discount:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
              <div className="deadline-flags">
                {(['createBill', 'sendBill', 'isRenewal'] as const).map(
                  (key) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={row[key] === true}
                        onChange={(e) =>
                          update(index, { [key]: e.target.checked })
                        }
                      />
                      {key}
                    </label>
                  ),
                )}
              </div>
              {!row.sendBill && (
                <div className="deadline-row">
                  <strong>Send invoice</strong>
                  <div className="operational-pair">
                    {date(index, 'validFrom', 'Send from')}
                    {date(index, 'validTo', 'Send until')}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="button"
                onClick={() => save(rows.filter((_, i) => i !== index))}
                aria-label={`Remove deadline ${index + 1}`}
              >
                Remove deadline
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() =>
              save([
                ...rows,
                {
                  from: '',
                  discount: 0,
                  createBill: true,
                  sendBill: true,
                  isRenewal: false,
                  comment: '',
                },
              ])
            }
          >
            Add deadline
          </button>
        </>
      )}
    </section>
  );
}
