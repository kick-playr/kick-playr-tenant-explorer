import { IntegrationConnectionCard } from './integration-connection-card';
import type { IntegrationSectionProps } from './types';
export function IntegrationProviderSection({
  connections,
  ...actions
}: IntegrationSectionProps) {
  return (
    <div className="record-list">
      {connections.map((connection) => (
        <IntegrationConnectionCard
          key={`${actions.path}/${connection.id}/${connection.revision}`}
          connection={connection}
          {...actions}
        />
      ))}
    </div>
  );
}
