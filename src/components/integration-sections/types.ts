import type { Transport } from '../../lib/api';
import type { MailConfiguration } from '../integration-mail-settings';
import type { OAuthSettings } from '../integration-client-settings';
export interface Connection {
  mail?: MailConfiguration;
  oauth?: OAuthSettings;
  id: string;
  provider: string;
  status: string;
  accountReference: string;
  revision: string | null;
  secretFields: string[];
  canToggle: boolean;
  canConnect: boolean;
}
export interface IntegrationActions {
  request?: Transport;
  onBusyChange?: (busy: boolean) => void;
  path: string;
  busy: boolean;
  onConnect: (connection: Connection) => Promise<void>;
  onToggle: (connection: Connection) => Promise<void>;
  onSave: (
    connection: Connection,
    secret: Record<string, unknown>,
  ) => Promise<boolean>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}
export interface IntegrationSectionProps extends IntegrationActions {
  active?: boolean;
  connections: Connection[];
}
