import { BexioLabelsSection } from './bexio-labels-section';
import type { ComponentType } from 'react';
import type { Connection, IntegrationSectionProps } from './types';
import { IntegrationProviderSection } from './integration-provider-section';
import { BexioIntegrationSection } from './bexio-section';
import { DropboxIntegrationSection } from './dropbox-section';
import { SmtpIntegrationSection } from './smtp-section';
import { ImapIntegrationSection } from './imap-section';
import { PingenIntegrationSection } from './pingen-section';
import { MatrixIntegrationSection } from './matrix-section';
interface IntegrationSection {
  id: string;
  label: string;
  Component: ComponentType<IntegrationSectionProps>;
}
/** Register a provider's component here to extend integration navigation. */
export const INTEGRATION_SECTIONS: readonly IntegrationSection[] = [
  { id: 'bexio', label: 'Bexio', Component: BexioIntegrationSection },
  {
    id: 'bexio-labels',
    label: 'Bexio tags & labels',
    Component: BexioLabelsSection,
  },
  { id: 'dropbox', label: 'Dropbox', Component: DropboxIntegrationSection },
  { id: 'smtp', label: 'SMTP', Component: SmtpIntegrationSection },
  { id: 'imap', label: 'IMAP', Component: ImapIntegrationSection },
  { id: 'pingen', label: 'Pingen', Component: PingenIntegrationSection },
  { id: 'matrix', label: 'Matrix', Component: MatrixIntegrationSection },
];
export function integrationSections(
  connections: Connection[],
): IntegrationSection[] {
  return [
    ...new Set([
      ...connections.map((connection) => connection.provider),
      'bexio',
    ]),
  ].flatMap((provider) => {
    const section = INTEGRATION_SECTIONS.find(
      (section) => section.id === provider,
    ) ?? {
      id: provider,
      label: provider,
      Component: IntegrationProviderSection,
    };
    return provider === 'bexio'
      ? [
          section,
          INTEGRATION_SECTIONS.find(
            (section) => section.id === 'bexio-labels',
          )!,
        ]
      : [section];
  });
}
