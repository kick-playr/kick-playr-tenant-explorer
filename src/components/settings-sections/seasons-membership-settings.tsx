import { useId, useRef, type ReactNode } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  MinusIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Field } from '../ui';
import type { SettingsSectionProps } from './types';

function stepSeason(value: string, direction: number) {
  const m = /^(\d{2}|\d{4})\.([12])$/.exec(value);
  if (!m) return null;
  const position = Number(m[1]) * 2 + Number(m[2]) - 1 + direction;
  if (position < 0) return null;
  return `${String(Math.floor(position / 2)).padStart(m[1]!.length, '0')}.${(position % 2) + 1}`;
}
function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="operational-date">
        <input
          id={id}
          ref={ref}
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Choose ${label.toLowerCase()}`}
          onClick={() => {
            try {
              ref.current?.showPicker?.();
            } catch {
              /* Focus is the fallback when a picker is unavailable. */
            }
            ref.current?.focus();
          }}
        >
          <CalendarDaysIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="operational-row">
      <h4>{title}</h4>
      <div className="operational-row-content">{children}</div>
    </div>
  );
}
export function SeasonsMembershipSettings({
  draft,
  onChange,
  onChangeMany,
  disabled,
}: SettingsSectionProps) {
  const apply = (values: Record<string, string>) =>
    onChangeMany
      ? onChangeMany(values)
      : Object.entries(values).forEach(([k, v]) => onChange(k, v));
  const current = draft.currentSaison ?? '',
    next = draft.nextSaison ?? '';
  const direction = current === next ? -1 : 1;
  const candidate = stepSeason(current, direction);
  const canAlign =
    !!candidate &&
    !!stepSeason(next, 0) &&
    (current === next ||
      Number(current.split('.')[0]) * 2 + Number(current.split('.')[1]) <
        Number(next.split('.')[0]) * 2 + Number(next.split('.')[1]));
  function shiftSeason(dir: number) {
    const season = stepSeason(current, dir),
      following = season && stepSeason(season, 1);
    if (season && following)
      apply({
        currentSaison: season,
        nextSaison: following,
        billingSaison: season.split('.')[0] + '.2',
      });
  }
  const year = Number(draft.currentMembershipYear),
    validYear =
      /^\d{4}$/.test(draft.currentMembershipYear ?? '') &&
      year > 1000 &&
      year < 9999;
  function shiftYear(dir: number) {
    const value = year + dir;
    apply({
      currentMembershipYear: String(value),
      currentMembershipSeason: `${value - 1}/${value}`,
    });
  }
  let seasons: Record<string, Record<string, unknown>> = {},
    malformed = false;
  try {
    const parsed = JSON.parse(draft.seasons || '{}');
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.values(parsed).some(
        (v) => !v || typeof v !== 'object' || Array.isArray(v),
      )
    )
      throw Error();
    seasons = parsed;
  } catch {
    malformed = true;
  }
  const dates = seasons[current] ?? {};
  function dateChange(key: string, value: string) {
    onChange(
      'seasons',
      JSON.stringify(
        { ...seasons, [current]: { ...dates, [key]: value } },
        null,
        2,
      ),
    );
  }
  const text = (key: string, label: string, type = 'text') => (
    <Field label={label}>
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        value={draft[key] ?? ''}
        onChange={(e) => onChange(key, e.target.value)}
      />
    </Field>
  );
  return (
    <section
      className="settings-group operational-settings"
      aria-label="Seasons and membership"
    >
      <details open>
        <summary>
          <h3>Settings</h3>
          <ChevronDownIcon aria-hidden="true" />
        </summary>
        <p className="muted">
          Set the current and next seasons, membership, invoice waiting periods
          and deadlines. The search range determines how far back invoices are
          considered.
        </p>
        <div className="operational-rows">
          <Row title="Season">
            <div className="operational-season-controls">
              <button
                type="button"
                disabled={disabled || !stepSeason(current, -1)}
                aria-label="Previous season"
                onClick={() => shiftSeason(-1)}
              >
                <ArrowLeftIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={disabled || !canAlign}
                aria-label={
                  direction === -1
                    ? 'Decrease current season'
                    : 'Increase current season'
                }
                onClick={() => candidate && apply({ currentSaison: candidate })}
              >
                {direction === -1 ? (
                  <MinusIcon aria-hidden="true" />
                ) : (
                  <PlusIcon aria-hidden="true" />
                )}
              </button>
              {text('currentSaison', 'Current season')}
              {text('nextSaison', 'Next season')}
              {text('billingSaison', 'Billing season')}
              <button
                type="button"
                disabled={disabled || !stepSeason(current, 1)}
                aria-label="Advance season"
                onClick={() => shiftSeason(1)}
              >
                <ArrowRightIcon aria-hidden="true" />
              </button>
            </div>
          </Row>
          <Row title="Membership">
            <div className="operational-membership-controls">
              <button
                type="button"
                disabled={disabled || !validYear}
                aria-label="Previous membership year"
                onClick={() => shiftYear(-1)}
              >
                <ArrowLeftIcon aria-hidden="true" />
              </button>
              {text('currentMembershipYear', 'Membership year')}
              {text('currentMembershipSeason', 'Membership season')}
              <button
                type="button"
                disabled={disabled || !validYear}
                aria-label="Next membership year"
                onClick={() => shiftYear(1)}
              >
                <ArrowRightIcon aria-hidden="true" />
              </button>
              <div className="operational-membership-date">
                <DateField
                  label="Membership start date"
                  value={draft.membershipStartDate ?? ''}
                  onChange={(value) => onChange('membershipStartDate', value)}
                />
              </div>
            </div>
          </Row>
          <Row title="Invoice">
            <div className="operational-pair">
              {text(
                'defaultBillWaitTimeInDays',
                'Reminder wait in days',
                'number',
              )}
              {text(
                'defaultBillingTimeInDays',
                'Payment period in days',
                'number',
              )}
              {text('billSearchMonths', 'Bill search months', 'number')}
            </div>
          </Row>
          <Row title="Dates">
            <div className="operational-pair">
              <DateField
                label="Season start date"
                disabled={malformed || !stepSeason(current, 0)}
                value={
                  typeof dates.startDate === 'string' ? dates.startDate : ''
                }
                onChange={(value) => dateChange('startDate', value)}
              />
              <DateField
                label="Season end date"
                disabled={malformed || !stepSeason(current, 0)}
                value={typeof dates.endDate === 'string' ? dates.endDate : ''}
                onChange={(value) => dateChange('endDate', value)}
              />
            </div>
            {malformed && (
              <p role="alert">
                Season dates are invalid. Repair the season dates below before
                editing them.
              </p>
            )}
          </Row>
        </div>
        <details className="operational-all-dates">
          <summary>All season dates</summary>
          <Field label="Season dates">
            <textarea
              rows={6}
              value={draft.seasons ?? ''}
              onChange={(e) => onChange('seasons', e.target.value)}
            />
          </Field>
        </details>
      </details>
    </section>
  );
}
