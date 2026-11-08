import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { TenantStaticSecrets } from '../src/components/tenant-static-secrets.tsx';

const originalFetch = globalThis.fetch;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
);
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (originalClipboard)
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
function fixture(
  canRead = true,
  copyFails = false,
  extra?: (path: string) => unknown,
) {
  const calls: string[] = [],
    copied: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        if (copyFails) throw Error('SECRET-CANARY');
        copied.push(value);
      },
    },
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const path = new URL(url, 'http://localhost').pathname;
    const override = await extra?.(path);
    const value =
      override ??
      (path.endsWith('/resources')
        ? [
            {
              _id: 'resource-one',
              name: 'smtp-primary',
              kind: 'integration',
              currentVersionNumber: 3,
              currentVersionId: 'version-three',
            },
          ]
        : path.endsWith('/access')
          ? { canRead, canWrite: false }
          : path.endsWith('/consent')
            ? { enabled: true, canManage: false, revision: 1 }
            : path.endsWith('/catalog')
              ? {
                  applications: [
                    { _id: 'app-a', name: 'App A' },
                    { _id: 'app-b', name: 'App B' },
                  ],
                  assignments: [],
                }
              : { password: 'SECRET-CANARY' });
    return Response.json(value);
  };
  render(<TenantStaticSecrets environment="development" tenantId="club-one" />);
  return { calls, copied };
}
test('shows five columns and copies only the explicitly requested version without rendering its value', async () => {
  const f = fixture();
  const button = await screen.findByRole('button', {
    name: 'Copy value for smtp-primary',
  });
  assert.deepEqual(
    screen.getAllByRole('columnheader').map((el) => el.textContent),
    ['Purpose', 'Type', 'Version', 'Version ID', 'Value'],
  );
  assert.ok(screen.getByText('version-three'));
  assert.equal(
    f.calls.some((url) => url.includes('/reveal/')),
    false,
  );
  fireEvent.click(button);
  await waitFor(() =>
    assert.deepEqual(f.copied, ['{"password":"SECRET-CANARY"}']),
  );
  assert.equal(
    f.calls.filter((url) =>
      url.includes('/resources/resource-one/reveal/version-three'),
    ).length,
    1,
  );
  assert.equal(document.body.textContent?.includes('SECRET-CANARY'), false);
  assert.ok(await screen.findByRole('status'));
});
test('keeps copy disabled without read permission', async () => {
  const f = fixture(false);
  const button = await screen.findByRole('button', {
    name: 'Copy value for smtp-primary',
  });
  assert.equal((button as HTMLButtonElement).disabled, true);
  fireEvent.click(button);
  assert.equal(
    f.calls.some((url) => url.includes('/reveal/')),
    false,
  );
});
test('clipboard errors never reveal secret values in the page', async () => {
  fixture(true, true);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Copy value for smtp-primary' }),
  );
  assert.match((await screen.findByRole('alert')).textContent ?? '', /copy/i);
  assert.equal(document.body.textContent?.includes('SECRET-CANARY'), false);
});

test('displays and copies a pinned historical version instead of the current resource version', async () => {
  const f = fixture(true, false, (path) =>
    path.endsWith('/links/app-a')
      ? {
          links: [
            {
              resourceId: 'resource-one',
              accessName: 'SMTP',
              versionPolicy: 'version-one',
            },
          ],
        }
      : path.endsWith('/versions')
        ? [{ _id: 'version-one', resourceId: 'resource-one', versionNumber: 1 }]
        : undefined,
  );
  await screen.findByText('smtp-primary');
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Application version context' }),
    { target: { value: 'app-a' } },
  );
  assert.ok(await screen.findByText('1 · Pinned'));
  assert.ok(screen.getByText('version-one'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy value for smtp-primary' }),
  );
  await waitFor(() => assert.equal(f.copied.length, 1));
  assert.equal(
    f.calls.some((url) => url.includes('/reveal/version-three')),
    false,
  );
  assert.equal(
    f.calls.filter((url) => url.includes('/reveal/version-one')).length,
    1,
  );
});
test('latest links resolve the current version and unlinked resources cannot be copied', async () => {
  fixture(true, false, (path) =>
    path.endsWith('/links/app-a')
      ? {
          links: [
            {
              resourceId: 'resource-one',
              accessName: 'SMTP',
              versionPolicy: 'latest',
            },
          ],
        }
      : path.endsWith('/links/app-b')
        ? { links: [] }
        : undefined,
  );
  await screen.findByText('smtp-primary');
  const selector = screen.getByRole('combobox', {
    name: 'Application version context',
  });
  fireEvent.change(selector, { target: { value: 'app-a' } });
  assert.ok(await screen.findByText('3 · Latest'));
  assert.ok(screen.getByText('version-three'));
  fireEvent.change(selector, { target: { value: 'app-b' } });
  assert.ok(await screen.findByText('Not linked'));
  assert.equal(
    (
      screen.getByRole('button', {
        name: 'Copy value for smtp-primary',
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
test('unknown pinned versions do not fall back to the current version', async () => {
  const f = fixture(true, false, (path) =>
    path.endsWith('/links/app-a')
      ? {
          links: [
            {
              resourceId: 'resource-one',
              accessName: 'SMTP',
              versionPolicy: 'unknown-version',
            },
          ],
        }
      : path.endsWith('/versions')
        ? []
        : undefined,
  );
  await screen.findByText('smtp-primary');
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Application version context' }),
    { target: { value: 'app-a' } },
  );
  assert.ok(await screen.findByText('Pinned · Unavailable'));
  const button = screen.getByRole('button', {
    name: 'Copy value for smtp-primary',
  });
  assert.equal((button as HTMLButtonElement).disabled, true);
  fireEvent.click(button);
  assert.equal(
    f.calls.some((url) => url.includes('/reveal/')),
    false,
  );
});

test('a late response for the previous application cannot replace the selected application', async () => {
  let resolveOld!: (value: unknown) => void;
  const oldLinks = new Promise((resolve) => {
    resolveOld = resolve;
  });
  fixture(true, false, (path) =>
    path.endsWith('/links/app-a')
      ? oldLinks
      : path.endsWith('/links/app-b')
        ? {
            links: [
              {
                resourceId: 'resource-one',
                accessName: 'SMTP',
                versionPolicy: 'latest',
              },
            ],
          }
        : undefined,
  );
  await screen.findByText('smtp-primary');
  const selector = screen.getByRole('combobox', {
    name: 'Application version context',
  });
  fireEvent.change(selector, { target: { value: 'app-a' } });
  fireEvent.change(selector, { target: { value: 'app-b' } });
  assert.ok(await screen.findByText('3 · Latest'));
  resolveOld({ links: [] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(screen.getByText('3 · Latest'));
  assert.equal(screen.queryByText('Not linked'), null);
});
test('a failed same-application refresh invalidates the previous pin and disables copying',async()=>{
 let linkReads=0;
 const f=fixture(true,false,(path)=>{
  if(path.endsWith('/access'))return {canRead:true,canWrite:true};
  if(path.endsWith('/links/app-a')) {
   if(++linkReads>1)throw Error('Metadata unavailable');
   return {links:[{resourceId:'resource-one',accessName:'SMTP',versionPolicy:'version-one'}],deployment:{revision:1}};
  }
  if(path.endsWith('/versions'))return [{_id:'version-one',resourceId:'resource-one',versionNumber:1}];
 });
 await screen.findByRole('button',{name:'Copy value for smtp-primary'});
 fireEvent.change(screen.getByRole('combobox',{name:'Application version context'}),{target:{value:'app-a'}});
 await screen.findByText('1 · Pinned');
 fireEvent.click(screen.getByRole('button',{name:'Assign application'}));
 await screen.findByText('Application version information is unavailable. Try reloading the page.');
 const copy=screen.getByRole('button',{name:'Copy value for smtp-primary'});
 assert.equal((copy as HTMLButtonElement).disabled,true);
 assert.equal(screen.queryByText('1 · Pinned'),null);
 fireEvent.click(copy);assert.deepEqual(f.copied,[]);
});
