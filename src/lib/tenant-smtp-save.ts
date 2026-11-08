import type { Transport } from './api';
import type { Connection } from '../components/integration-sections/types';
export async function confirmTenantSmtpSave(input: {
  path: string;
  connection: Connection;
  settings: Record<string, unknown>;
  publish: () => Promise<{ resourceId: string; versionId: string }>;
  request: Transport;
  pause?: (ms: number) => Promise<void>;
}) {
  const published = await input.publish();
  const pause =
    input.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 61; attempt++) {
    let data: { items: Connection[] } | undefined;
    try {
      data = (await input.request(input.path + '/integrations')) as {
        items: Connection[];
      };
    } catch {
      /* A new static generation may still be preparing. */
    }
    const current = data?.items?.find((c) => c.id === input.connection.id);
    if (
      current?.mail?.vault?.resourceId === published.resourceId &&
      current.mail.vault.versionId === published.versionId
    ) {
      if (
        current.provider !== input.connection.provider ||
        current.status === 'active' ||
        (current.revision !== null && !current.revision)
      )
        throw Error(
          'Mail settings were saved in Vault, but the connection changed. Reload before continuing.',
        );
      return input.request(
        input.path + '/integrations/' + encodeURIComponent(current.id),
        {
          method: 'PUT',
          body: JSON.stringify({
            expectedRevision: current.revision,
            secret: input.settings,
          }),
        },
      );
    }
    if (attempt < 60) await pause(1500);
  }
  throw Error(
    'Mail settings were saved in Vault. The Club API has not confirmed the selected version yet; reload before continuing.',
  );
}
