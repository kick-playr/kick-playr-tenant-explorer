import { IntegrationProviderSection } from './integration-provider-section';
import type { IntegrationSectionProps } from './types';
export function SmtpIntegrationSection(props: IntegrationSectionProps) {
  return <IntegrationProviderSection {...props} />;
}
