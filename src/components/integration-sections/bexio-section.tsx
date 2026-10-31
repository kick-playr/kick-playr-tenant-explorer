import { IntegrationProviderSection } from './integration-provider-section';
import type { IntegrationSectionProps } from './types';
export function BexioIntegrationSection(props: IntegrationSectionProps) {
  return (
    <>
      {!props.connections.length && (
        <p className="muted">No Bexio connection is configured.</p>
      )}
      <IntegrationProviderSection {...props} />
    </>
  );
}
