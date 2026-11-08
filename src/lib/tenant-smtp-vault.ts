/** Fixed tenant Mail publication coordinator. Values stay inside the authenticated
 * server route and are never returned to the browser or included in errors. */
export interface SmtpVaultPorts {
  provider?: 'smtp' | 'imap';
  scope: { environment: string; tenantId: string };
  resourceId: string;
  input: unknown;
  vault(path: string, method?: string, body?: unknown): Promise<unknown>;
  connection(): Promise<unknown>;
}
export class SmtpVaultError extends Error {}
function fail(
  message = 'Mail configuration changed or is unavailable. Reload before saving.',
): never {
  throw new SmtpVaultError(message);
}
type Data = Record<string, unknown>;
const object = (value: unknown): value is Data =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown): Data => {
  if (!object(value)) fail();
  return value;
};
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= max &&
  v.trim() === v &&
  !/[\x00-\x1f\x7f]/.test(v);
const password = (v: unknown) =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 4096 &&
  !/[\x00-\x1f\x7f]/.test(v);
const email = (value: unknown): boolean => {
  if (!text(value, 254)) return false;
  const match = /^([A-Za-z0-9._+-]{1,64})@([a-z0-9.-]+)$/.exec(value as string);
  return (
    !!match &&
    !match[1]!.startsWith('.') &&
    !match[1]!.endsWith('.') &&
    !match[1]!.includes('..') &&
    match[2]!.split('.').length >= 2 &&
    match[2]!
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  );
};
const canonical = (v: unknown): string =>
  JSON.stringify(
    v && typeof v === 'object'
      ? Array.isArray(v)
        ? v.map((x) => JSON.parse(canonical(x)))
        : Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, JSON.parse(canonical((v as Data)[k]))]),
          )
      : v,
  );
type Resource = {
  _id: string;
  name: string;
  kind: string;
  schemaIdentity: string;
  revision: number;
  currentVersionId: string;
};
type Link = { resourceId: string; accessName: string; versionPolicy: string };
const links = (
  value: unknown,
): { links: Link[]; deployment: { revision: number } } => {
  const data = record(value),
    deployment = record(data.deployment);
  if (
    !Array.isArray(data.links) ||
    typeof deployment.revision !== 'number' ||
    !Number.isSafeInteger(deployment.revision)
  )
    fail();
  const rows = data.links.map((value) => {
    const row = record(value);
    if (
      !text(row.resourceId, 128) ||
      !text(row.accessName, 128) ||
      !text(row.versionPolicy, 128)
    )
      fail();
    return {
      resourceId: row.resourceId as string,
      accessName: row.accessName as string,
      versionPolicy: row.versionPolicy as string,
    };
  });
  if (new Set(rows.map((row) => row.accessName)).size !== rows.length) fail();
  return {
    links: rows,
    deployment: { revision: deployment.revision as number },
  };
};
export async function saveTenantSmtpVault(
  p: SmtpVaultPorts,
): Promise<{ resourceId: string; versionId: string }> {
  const { environment, tenantId } = p.scope;
  const provider = p.provider ?? 'smtp';
  if (!['smtp', 'imap'].includes(provider)) fail();
  if (
    !['development', 'test', 'preview', 'production'].includes(environment) ||
    !text(tenantId, 64) ||
    !/^[a-z0-9][a-z0-9-]*$/.test(tenantId) ||
    !text(p.resourceId, 128) ||
    !/^[A-Za-z0-9-]+$/.test(p.resourceId)
  )
    fail();
  const rawInput = record(p.input);
  const input = rawInput as {
    connectionId: string;
    expectedRevision: string | null;
    versionId: string;
    settings: unknown;
  };
  if (
    !object(input) ||
    Object.keys(input).sort().join() !==
      'connectionId,expectedRevision,settings,versionId' ||
    !text(input.connectionId, 128) ||
    (input.expectedRevision !== null && !text(input.expectedRevision, 128)) ||
    !text(input.versionId, 128)
  )
    fail();
  const rawSettings = record(input.settings);
  const s = rawSettings as {
    host: string;
    port: number;
    user: string;
    password?: string;
    fromAddress?: string;
    inbox?: string;
    archive?: string;
  };
  if (
    !object(s) ||
    Object.keys(s).some(
      (k) => !(provider === 'smtp' ? ['host', 'port', 'user', 'password', 'fromAddress'] : ['host', 'port', 'user', 'password', 'inbox', 'archive']).includes(k),
    ) ||
    !text(s.host, 253) ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(s.host) ||
    !s.host.includes('.') ||
    !/[a-z]/.test(s.host.split('.').pop()!) ||
    /\.(?:localhost|local|internal|home|test|invalid|example)$/.test(s.host) ||
    !s.host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    !(provider === 'smtp' ? [465, 587] : [993]).includes(s.port) ||
    !text(s.user, provider === 'imap' ? 256 : 4096) ||
    (provider === 'smtp' ? !email(s.fromAddress) : (s.inbox !== 'INBOX' || (!text(s.archive, 128) || !/^[A-Za-z0-9][A-Za-z0-9 _./-]*$/.test(s.archive as string) || (s.archive as string).split('/').some(part => !part || part === '.' || part === '..')) || s.archive === s.inbox)) ||
    (s.password !== undefined && !password(s.password))
  )
    fail('Enter a valid Mail host, TLS port, username and sender address.');
  const authority = async () => {
    const c = record(await p.connection());
    const mail = record(c.mail),
      vault = record(mail.vault);
    if (
      !c ||
      c.id !== input.connectionId ||
      c.provider !== provider ||
      c.status === 'active' ||
      c.revision !== input.expectedRevision ||
      vault.resourceId !== p.resourceId ||
      vault.versionId !== input.versionId
    )
      fail(
        'Mail must be disabled and its tenant Vault version must be current. Reload before saving.',
      );

  };
  await authority();
  const permissions = record(await p.vault('access'));
  if (permissions.canRead !== true || permissions.canWrite !== true)
    fail('Tenant Vault read and write permission is required.');
  const resource = async () => {
    let after = '';
    for (let page = 0; page < 100; page++) {
      const rows = await p.vault(
        'resources?limit=100' +
          (after ? '&after=' + encodeURIComponent(after) : ''),
      );
      if (!Array.isArray(rows) || rows.length > 100) fail();
      const found = rows.map(record).find((r) => r._id === p.resourceId);
      if (found) {
        if (
          found.environment !== environment ||
          found.ownerType !== 'tenant' ||
          found.ownerId !== tenantId ||
          found.kind !== 'integration' ||
          typeof found.schemaIdentity !== 'string' ||
          !['builtin:email@1', 'builtin:email@2'].includes(
            found.schemaIdentity,
          ) ||
          typeof found.revision !== 'number' ||
          !Number.isSafeInteger(found.revision) ||
          !text(found.name, 256) ||
          !text(found.currentVersionId, 128) ||
          found.enabled === false ||
          found.deletedAt
        )
          fail('Mail configuration must belong to this tenant in Vault.');
        return found as unknown as Resource;
      }
      if (rows.length < 100) break;
      const next = record(rows.at(-1))._id;
      if (!text(next, 128) || next === after) fail();
      after = next;
    }
    return fail('Mail configuration must belong to this tenant in Vault.');
  };
  const original = await resource();
  const linkState = links(await p.vault('links/club-api'));

  const relevant = linkState.links.filter((l) => l.resourceId === p.resourceId);
  if (!relevant.length)
    fail('Mail application links changed. Reload before saving.');
  const readValue = (id: string) =>
    p.vault(
      'resources/' +
        encodeURIComponent(p.resourceId) +
        '/reveal/' +
        encodeURIComponent(id),
      'POST',
    );
  const previous = record(await readValue(input.versionId));
  if (
    !object(previous) ||
    previous.protocol !== provider ||
    !password(previous.password)
  )
    fail();
  const value = {
    ...previous,
    host: s.host,
    port: s.port,
    tls: s.port === 587 ? 'starttls' : 'implicit',
    username: s.user,
    password: s.password ?? previous.password,
    ...(provider === 'smtp' ? { sender: s.fromAddress } : { inboxFolder: s.inbox, archiveFolder: s.archive }),
  };
  let versionId = input.versionId;
  if (original.currentVersionId !== input.versionId) {
    const head = await readValue(original.currentVersionId);
    if (canonical(head) === canonical(value) &&
        (provider !== 'imap' || original.schemaIdentity === 'builtin:email@2'))
      versionId = original.currentVersionId;
    else if (canonical(head) !== canonical(previous))
      fail(
        'Mail is pinned to an older version while the current Vault configuration differs. Review the current version before saving.',
      );
  }
  // A retry may arrive after publication but before the runtime refreshes.
  // Accept moved links only when they already resolve to the exact desired value.
  if (relevant.some((l) => {
    const selected = l.versionPolicy === 'latest'
      ? original.currentVersionId : l.versionPolicy;
    return selected !== input.versionId && selected !== versionId;
  })) fail('Mail application links changed. Reload before saving.');
  if (
    versionId === input.versionId &&
    (canonical(previous) !== canonical(value) ||
      (provider === 'imap' && original.schemaIdentity !== 'builtin:email@2'))
  ) {
    await authority();
    let result: unknown;
    try {
      result = await p.vault(
        'resources/' + encodeURIComponent(p.resourceId),
        'PUT',
        {
          revision: original.revision,
          resource: {
            name: original.name,
            kind: 'integration',
            schemaIdentity: provider === 'imap' ? 'builtin:email@2' : original.schemaIdentity,
            value,
          },
        },
      );
    } catch {
      try {
        const current = await resource();
        if (
          current.revision <= original.revision ||
          current.currentVersionId === input.versionId ||
          canonical(await readValue(current.currentVersionId)) !==
            canonical(value)
        )
          fail();
        result = current;
      } catch {
        return fail(
          'Could not confirm the Vault Mail version. Reload and check before retrying.',
        );
      }
    }
    const confirmed = record(result);
    if (
      confirmed._id !== p.resourceId ||
      !text(confirmed.currentVersionId, 128)
    )
      fail('Could not confirm the Vault Mail version. Reload before retrying.');
    versionId = confirmed.currentVersionId as string;
  }
  if (
    versionId !== input.versionId &&
    relevant.some((l) => l.versionPolicy !== 'latest' && l.versionPolicy !== versionId)
  ) {
    const rows = linkState.links.map((l) => ({
      resourceId: l.resourceId,
      accessName: l.accessName,
      versionPolicy:
        l.resourceId === p.resourceId && l.versionPolicy !== 'latest'
          ? versionId
          : l.versionPolicy,
    }));
    const normalized = (items: Link[]) =>
      canonical(
        items
          .map((l) => ({
            resourceId: l.resourceId,
            accessName: l.accessName,
            versionPolicy: l.versionPolicy,
          }))
          .sort((a, b) => a.accessName.localeCompare(b.accessName)),
      );
    try {
      await p.vault('links/club-api', 'PUT', {
        revision: linkState.deployment.revision,
        rows,
      });
    } catch {
      try {
        const actual = links(await p.vault('links/club-api'));
        if (
          !Array.isArray(actual.links) ||
          normalized(actual.links) !== normalized(rows)
        )
          fail();
      } catch {
        return fail(
          'The Vault Mail version was saved, but its application link could not be confirmed. Review the link before retrying.',
        );
      }
    }
  }
  return { resourceId: p.resourceId, versionId };
}
