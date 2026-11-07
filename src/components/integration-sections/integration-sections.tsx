'use client';
import { useId } from 'react';
import { integrationSections } from './registry';
import type { IntegrationSectionProps } from './types';
export function IntegrationSections({
  activeSection,
  onSectionChange,
  connections,
  ...actions
}: IntegrationSectionProps & {
  activeSection: string;
  onSectionChange: (id: string) => void;
}) {
  const prefix = useId();
  const sections = integrationSections(connections);
  const selected = sections.some((section) => section.id === activeSection)
    ? activeSection
    : sections[0]?.id;
  return (
    <>
      <nav
        className="tabs settings-subnav integration-subnav"
        aria-label="Integration sections"
      >
        {sections.map(({ id, label }) => (
          <button
            type="button"
            key={id}
            id={`${prefix}-${id}-menu`}
            aria-controls={`${prefix}-${id}-panel`}
            aria-pressed={selected === id}
            disabled={actions.busy}
            onClick={() => onSectionChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <h2>Integrations</h2>
      <p className="muted">
        Manage your club’s live connections. Stored credentials are never
        displayed.
      </p>
      {sections.map(({ id, Component }) => (
        <div
          key={id}
          id={`${prefix}-${id}-panel`}
          role="region"
          aria-labelledby={`${prefix}-${id}-menu`}
          hidden={id !== selected}
        >
          <fieldset disabled={actions.busy || id !== selected}>
            <Component
              active={id === selected}
              connections={connections.filter(
                (connection) => connection.provider === id,
              )}
              {...actions}
            />
          </fieldset>
        </div>
      ))}
    </>
  );
}
