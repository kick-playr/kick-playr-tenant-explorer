'use client';

import { useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { tenantPath, type Transport } from '../lib/api';
import type { TenantKeyFiles } from '../lib/types';
import { Badge, ErrorText, Notice, PanelHeading } from './ui';

const descriptions = {
  wrapping: 'Protects the data keys used to encrypt operational records.',
  index: 'Protects deterministic indexes used to search encrypted records.',
  control: 'Protects encrypted tenant API-key and control credentials.',
};
export function TenantKeys({
  environment,
  tenantId,
  request,
}: {
  environment: string;
  tenantId: string;
  request: Transport;
}) {
  const [refresh, setRefresh] = useState(0);
  const context = `${environment}/${tenantId}`;
  const [response, setResponse] = useState<{
    context: string;
    refresh: number;
    result?: TenantKeyFiles;
    error?: unknown;
  }>();
  const current =
    response?.context === context && response?.refresh === refresh
      ? response
      : undefined;
  const result = current?.result;
  const error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    request(`${tenantPath(environment, tenantId)}/keys`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setResponse({ context, refresh, result: data as TenantKeyFiles });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResponse({ context, refresh, error });
      });
    return () => controller.abort();
  }, [environment, tenantId, context, request, refresh]);
  return (
    <>
      <PanelHeading
        title="Operational encryption keys"
        description="Server-side encryption keys bound to this tenant’s reference."
        aside={
          <button
            className="button secondary small"
            disabled={!result && !error}
            onClick={() => {
              setRefresh((n) => n + 1);
            }}
          >
            <ArrowPathIcon />
            Check keys
          </button>
        }
      />
      {error ? (
        <ErrorText error={error} />
      ) : !result ? (
        <p className="loading-text" role="status">
          Checking keys…
        </p>
      ) : (
        <>
          <div className="key-binding-summary">
            <code>{result.reference}</code>
            <Badge value={result.status} />
            {result.strategy === 'LOCAL_KEYVAULT' && (
              <span>Local Key Vault</span>
            )}
          </div>
          {result.status === 'unbound' ? (
            <Notice>
              No key sources are bound to this reference in the selected control
              database. Configure the API’s server-side key bindings; changing a
              tenant reference does not select arbitrary files.
            </Notice>
          ) : (
            <>
              <p className="muted">
                Profile: {result.profile} <span>·</span> Key version:{' '}
                {result.version}
              </p>
              <Notice>
                Key values stay on the API server. This view checks the
                configured source and 32-byte key length. It does not rotate
                keys or modify encrypted collections.
              </Notice>
              {result.status === 'unavailable' && (
                <Notice error>
                  {result.strategy === 'LOCAL_KEYVAULT'
                    ? 'Correct the vault namespace, read permissions and pinned key versions, then restart the affected applications and check again. Loaded snapshots do not refresh automatically.'
                    : 'Some key sources need attention. Missing or invalid environment values, or unsafe legacy files, must be corrected on the API server.'}
                </Notice>
              )}
              <div className="record-list">
                {result.files.map((file) => (
                  <article className="record key-file" key={file.kind}>
                    <div className="record-title">
                      <strong>{file.variable ?? file.filename}</strong>
                      <Badge value={file.status} />
                    </div>
                    <p>
                      {file.kind.charAt(0).toUpperCase() + file.kind.slice(1)}{' '}
                      key{file.bytes ? ` · ${file.bytes} bytes` : ''}
                    </p>
                    <p>{descriptions[file.kind]}</p>
                    <dl>
                      <dt>
                        {file.source === 'vault'
                          ? 'Vault mapping'
                          : file.source === 'environment'
                            ? 'Server environment variable'
                            : 'File on API server'}
                      </dt>
                      <dd>
                        <code>{file.variable ?? file.path}</code>
                      </dd>
                      {file.version && (
                        <>
                          <dt>Pinned vault version</dt>
                          <dd>
                            <code>{file.version}</code>
                          </dd>
                        </>
                      )}
                      {file.fingerprint && (
                        <>
                          <dt>SHA-256 fingerprint</dt>
                          <dd>
                            <code>{file.fingerprint}</code>
                          </dd>
                        </>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
