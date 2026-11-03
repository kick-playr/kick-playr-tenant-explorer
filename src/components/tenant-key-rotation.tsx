'use client';
import React, { useEffect, useState } from 'react';
import { tenantPath, type Transport } from '../lib/api';
import { Notice } from './ui';
const labels: Record<string, string> = {
  pending: 'Preparing key migration',
  migrating: 'Migrating encrypted records',
  'waiting-expiry': 'Waiting for existing approvals and guards to expire',
  verifying: 'Verifying migrated data',
  activating: 'Activating verified keys',
  completed: 'Key migration completed',
  failed: 'Key migration needs recovery',
};
type Progress = {
  operationId: string;
  stage: string;
  completed: number;
  total?: number;
  waitUntil?: number;
};
export function TenantKeyRotation({
  environment,
  tenantId,
  request,
}: {
  environment: string;
  tenantId: string;
  request: Transport;
}) {
  const [response, setResponse] = useState<{
    scope: string;
    progress?: Progress | null;
    failed?: boolean;
  }>();
  const scope = `${environment}/${tenantId}`;
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const record = (value: unknown): Record<string, unknown> => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error();
          return value as Record<string, unknown>;
        };
        const raw = record(
          await request(`${tenantPath(environment, tenantId)}/key-rotation`, {
            signal: abort.signal,
          }),
        );
        let progress: Progress | null = null;
        if (raw.rotation !== null) {
          const r = record(raw.rotation),
            declaredScope = record(r.scope);
          const { operationId, stage, completed, total, waitUntil } = r;
          if (
            declaredScope.environment !== environment ||
            declaredScope.tenant !== tenantId ||
            typeof operationId !== 'string' ||
            !/^[a-f0-9]{64}$/.test(operationId) ||
            typeof stage !== 'string' ||
            !Object.hasOwn(labels, stage) ||
            typeof completed !== 'number' ||
            !Number.isSafeInteger(completed) ||
            completed < 0 ||
            (total !== undefined &&
              (typeof total !== 'number' ||
                !Number.isSafeInteger(total) ||
                total < completed)) ||
            (waitUntil !== undefined &&
              (typeof waitUntil !== 'number' ||
                !Number.isSafeInteger(waitUntil) ||
                waitUntil < 0))
          )
            throw Error();
          progress = {
            operationId,
            stage,
            completed,
            ...(total === undefined ? {} : { total }),
            ...(waitUntil === undefined ? {} : { waitUntil }),
          };
        }
        if (!abort.signal.aborted) setResponse({ scope, progress });
      } catch {
        if (!abort.signal.aborted) setResponse({ scope, failed: true });
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 1000);
      }
    }
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [environment, tenantId, request, scope]);
  if (response?.scope !== scope) return null;
  if (response.failed)
    return (
      <Notice error>
        Key rotation status is unavailable. Check the API connection and
        permissions.
      </Notice>
    );
  const progress = response.progress;
  if (!progress) return null;
  return (
    <section aria-label="Encryption key migration">
      <Notice error={progress.stage === 'failed'}>
        <strong>{labels[progress.stage]}</strong>
        <p>
          {environment} / {tenantId}
        </p>
        <p>
          {progress.completed}
          {progress.total === undefined ? '' : ` / ${progress.total}`} records
          processed
        </p>
        {progress.stage === 'waiting-expiry' && progress.waitUntil && (
          <p>
            Waiting until {new Date(progress.waitUntil).toLocaleString()} before
            retrying this batch.
          </p>
        )}
        {!['completed'].includes(progress.stage) && (
          <p>
            This tenant remains unavailable until migration and activation are
            verified. Other tenants can continue working.
          </p>
        )}
        {progress.stage === 'failed' && (
          <p>
            The existing operation and recovery keys are retained. Recovery
            retries after the underlying problem is corrected.
          </p>
        )}
      </Notice>
    </section>
  );
}
