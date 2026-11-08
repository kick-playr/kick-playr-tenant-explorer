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
import { IntegrationMailSettings } from '../src/components/integration-mail-settings.tsx';
afterEach(cleanup);
const configuration = {
  host: 'mail.club.example',
  port: 465,
  user: 'user',
  hasPassword: true,
  allowedHosts: ['mail.club.example'],
  fromAddress: 'old@club.example',
  vault: { resourceId: 'one', versionId: 'v1' },
};
test('edits and submits the tenant sender and retains an omitted password', async () => {
  const saved: any[] = [];
  const dirty: boolean[] = [];
  render(
    <IntegrationMailSettings
      configuration={configuration}
      provider="smtp"
      active={false}
      busy={false}
      onDirtyChange={(v) => dirty.push(v)}
      onSave={async (v) => {
        saved.push(v);
        return true;
      }}
    />,
  );
  const sender = screen.getByRole('textbox', { name: 'Sender address' });
  assert.equal((sender as HTMLInputElement).readOnly, false);
  assert.ok(screen.getByRole('textbox', { name: 'Mail server' }));
  fireEvent.change(sender, { target: { value: 'billing@club.example' } });
  assert.equal(dirty.at(-1), true);
  fireEvent.click(screen.getByRole('button', { name: 'Save mail settings' }));
  await waitFor(() => assert.equal(saved.length, 1));
  assert.deepEqual(saved[0], {
    host: 'mail.club.example',
    port: 465,
    user: 'user',
    fromAddress: 'billing@club.example',
  });
  assert.equal(dirty.at(-1), false);
});
test('keeps active SMTP connections locked for editing', () => {
  render(
    <IntegrationMailSettings
      configuration={configuration}
      provider="smtp"
      active={true}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async () => true}
    />,
  );
  const sender = screen.getByRole('textbox', { name: 'Sender address' });
  assert.equal(sender.closest('fieldset')?.disabled, true);
  assert.equal(
    (
      screen.getByRole('button', {
        name: 'Save mail settings',
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
test('tests saved SMTP while active and blocks testing unsaved edits',async()=>{
 const sent:string[]=[];
 const view=render(<IntegrationMailSettings configuration={configuration} provider="smtp" active={true} busy={false} onDirtyChange={()=>{}} onSave={async()=>true} onTestEmail={async(to)=>{sent.push(to)}}/>);
 const recipient=screen.getByRole('textbox',{name:'Test recipient'});
 assert.equal(recipient.closest('fieldset')?.disabled,undefined);
 fireEvent.change(recipient,{target:{value:'recipient@club.ch'}});
 fireEvent.click(screen.getByRole('button',{name:'Test Email'}));
 await waitFor(()=>assert.deepEqual(sent,['recipient@club.ch']));
 assert.ok(screen.getByText('Test email accepted by the mail server.'));
 view.rerender(<IntegrationMailSettings configuration={configuration} provider="smtp" active={false} busy={false} onDirtyChange={()=>{}} onSave={async()=>true} onTestEmail={async(to)=>{sent.push(to)}}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Mail server'}),{target:{value:'mail.changed.ch'}});
 assert.equal((screen.getByRole('button',{name:'Test Email'}) as HTMLButtonElement).disabled,true);
});
test('IMAP test needs no recipient, remains available enabled, and reports both saved folders',async()=>{
 let calls=0;
 render(<IntegrationMailSettings configuration={{...configuration,port:993,inbox:'INBOX',archive:'INBOX.Archive'}} provider="imap" active={true} busy={false} onDirtyChange={()=>{}} onSave={async()=>true} onTestMailbox={async()=>{calls++;return {status:'connected',folders:[{name:'INBOX',status:'readable',messages:0,sampleRead:false},{name:'INBOX.Archive',status:'readable',messages:30,sampleRead:true}]}}}/>);
 assert.equal(screen.queryByRole('textbox',{name:'Test recipient'}),null);
 const button=screen.getByRole('button',{name:'Test Mailbox'});
 assert.equal((button as HTMLButtonElement).disabled,false);
 fireEvent.click(button);
 await waitFor(()=>assert.equal(calls,1));
 assert.match(screen.getByRole('status').textContent!,/Connection successful.*INBOX: readable \(empty\).*INBOX.Archive: readable \(30 messages, sample read\)/);
});
