'use client';
import { useId } from 'react';
export interface ProvisioningStep {
  id: string;
  title: string;
  instructions: string;
  description?: string;
  actions?: string[];
}
export function ProvisioningChecklist({
  steps,
  checked,
  disabled,
  onChange,
}: {
  steps: ProvisioningStep[];
  checked: string[];
  disabled: boolean;
  onChange: (checked: string[]) => void;
}) {
  const id = useId();
  return (
    <ol
      className="provisioning-checklist"
      aria-label="Vorbereitungs-Checkliste"
    >
      {steps.map((step, index) => {
        const complete = checked.includes(step.id);
        return (
          <li
            key={step.id}
            className={
              'provisioning-checklist-item' + (complete ? ' is-complete' : '')
            }
          >
            <div className="provisioning-checklist-content">
              <h3 id={`${id}-${step.id}-title`}>
                <span className="provisioning-step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{step.title}</strong>
              </h3>
              <p className="provisioning-step-description">
                {step.description ?? step.instructions}
              </p>
              {Boolean(step.actions?.length) && (
                <ul
                  className="provisioning-step-actions"
                  aria-label={`${step.title}: konkrete Schritte`}
                >
                  {step.actions!.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              )}
            </div>
            <label className="provisioning-checklist-check">
              <input
                type="checkbox"
                checked={complete}
                disabled={disabled}
                aria-label={`${step.title}: manuell erledigt`}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...checked, step.id]
                      : checked.filter((value) => value !== step.id),
                  )
                }
              />
              <span aria-hidden="true">{complete ? 'Erledigt' : 'Offen'}</span>
            </label>
          </li>
        );
      })}
    </ol>
  );
}
