'use client';
import { useState, type FormEvent } from 'react';
import { Field, Notice } from './ui';
export interface MailboxConnectionTest {status:'connected';folders:{name:string;status:'readable'|'missing'|'unreadable';messages:number|null;sampleRead:boolean}[];}
export interface MailConfiguration {
  host: string;
  port: number;
  user: string;
  hasPassword: boolean;
  allowedHosts: string[];
  fromAddress?: string;
  vault?: { resourceId: string; versionId: string };
  inbox?: string;
  archive?: string;
}
export function IntegrationMailSettings({
  configuration,
  provider,
  active,
  busy,
  onDirtyChange,
  onSave,
  onTestEmail,
  onTestMailbox,
}: {
  configuration: MailConfiguration;
  provider: 'smtp' | 'imap';
  active: boolean;
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (secret: Record<string, unknown>) => Promise<boolean>;
  onTestEmail?: (recipient: string) => Promise<void>;
  onTestMailbox?: () => Promise<MailboxConnectionTest>;
}) {
  const [host, setHost] = useState(configuration.host),
    [port, setPort] = useState(configuration.port),
    [user, setUser] = useState(configuration.user),
    [password, setPassword] = useState(''),
    [fromAddress, setFromAddress] = useState(configuration.fromAddress ?? ''),
    [inbox, setInbox] = useState(configuration.inbox ?? 'INBOX'),
    [archive, setArchive] = useState(configuration.archive ?? 'Archive');
  const [error, setError] = useState('');
  const [recipient,setRecipient]=useState('');
  const [testing,setTesting]=useState(false);
  const [testResult,setTestResult]=useState('');
  const changed = (
    next: Partial<{
      host: string;
      port: number;
      user: string;
      password: string;
      fromAddress: string;
      inbox: string;
      archive: string;
    }>,
  ) => {
    const value = {
      host,
      port,
      user,
      password,
      fromAddress,
      inbox,
      archive,
      ...next,
    };
    onDirtyChange(
      value.host !== configuration.host ||
        value.port !== configuration.port ||
        value.user !== configuration.user ||
        !!value.password ||
        (provider === 'smtp' &&
          value.fromAddress !== (configuration.fromAddress ?? '')) ||
        (provider === 'imap' &&
          (value.inbox !== (configuration.inbox ?? 'INBOX') ||
            value.archive !== (configuration.archive ?? 'Archive'))),
    );
  };
  const dirty =
    host !== configuration.host ||
    port !== configuration.port ||
    user !== configuration.user ||
    !!password ||
    (provider === 'smtp' &&
      fromAddress !== (configuration.fromAddress ?? '')) ||
    (provider === 'imap' &&
      (inbox !== configuration.inbox || archive !== configuration.archive));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || active || !dirty) return;
    setError('');
    if (provider === 'imap' && inbox === archive) {
      setError('Inbox and archive folders must be different.');
      return;
    }
    let saved = false;
    try {
      saved = await onSave({
        host,
        port,
        user,
        ...(password ? { password } : {}),
        ...(provider === 'smtp' ? { fromAddress } : {}),
        ...(provider === 'imap' ? { inbox, archive } : {}),
      });
    } finally {
      setPassword('');
      if (saved) onDirtyChange(false);
      else changed({ password: '' });
    }
  }
  return (
    <form className="integration-client-settings" onSubmit={save}>
      <h3>{provider.toUpperCase()} settings</h3>
      <p className="muted">
        {configuration.hasPassword
          ? 'Password configured.'
          : 'No password configured.'}{' '}
        Stored passwords are never displayed.
      </p>
      {active && (
        <p className="muted">
          Disable this connection before editing its settings.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      <fieldset disabled={busy || active}>
        <Field label="Mail server">
          <input
            type="text"
            value={host}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={provider === 'smtp' ? 'smtp.example.com' : 'imap.example.com'}
            onChange={(e) => {
              setHost(e.target.value);
              changed({ host: e.target.value });
            }}
          />
        </Field>
        <Field label="TLS port">
          <select
            value={port}
            onChange={(e) => {
              const value = Number(e.target.value);
              setPort(value);
              changed({ port: value });
            }}
          >
            {(provider === 'smtp' ? [465, 587] : [993]).map((value) => (
              <option value={value} key={value}>
                {value} ({value === 587 ? 'STARTTLS' : 'TLS'})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Username">
          <input
            value={user}
            required
            maxLength={4096}
            autoComplete="off"
            onChange={(e) => {
              setUser(e.target.value);
              changed({ user: e.target.value });
            }}
          />
        </Field>
        <Field
          label="New password"
          hint={
            configuration.hasPassword
              ? 'Leave blank to keep the configured password.'
              : 'Required for initial setup.'
          }
        >
          <input
            type="password"
            value={password}
            required={!configuration.hasPassword}
            maxLength={4096}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              changed({ password: e.target.value });
            }}
          />
        </Field>
        {provider === 'smtp' ? (
          <Field
            label="Sender address"
            hint="Saved in this tenant’s Vault SMTP configuration."
          >
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              value={fromAddress}
              onChange={(e) => {
                setFromAddress(e.target.value);
                changed({ fromAddress: e.target.value });
              }}
            />
          </Field>
        ) : (
          <>
            <Field label="Inbox folder">
              <input
                required
                value={inbox}
                maxLength={512}
                onChange={(e) => {
                  setInbox(e.target.value);
                  changed({ inbox: e.target.value });
                }}
              />
            </Field>
            <Field label="Archive folder">
              <input
                required
                value={archive}
                maxLength={512}
                onChange={(e) => {
                  setArchive(e.target.value);
                  changed({ archive: e.target.value });
                }}
              />
            </Field>
          </>
        )}
        <button
          className="button primary"
          disabled={
            busy || active || !dirty
          }
        >
          Save mail settings
        </button>
        <p className="muted">
          Saving does not send mail or enable the connection. Enable it
          separately when ready.
        </p>
      </fieldset>
      {provider === 'imap' && onTestMailbox && (
        <div className="smtp-test-email">
          <p className="muted">Checks the saved mailbox connection and reads both configured folders without changing messages.</p>
          {dirty && <p className="muted">Save your changes before testing the mailbox.</p>}
          <button type="button" className="button smtp-test-send" disabled={busy || testing || dirty}
            onClick={async()=>{
              setTestResult('');setTesting(true);
              try {
                const result=await onTestMailbox();
                setTestResult('Connection successful. '+result.folders.map(folder=>
                  `${folder.name}: ${folder.status==='missing'?'folder not found':folder.status==='unreadable'?'could not read folder':folder.messages===0?'readable (empty)':`readable (${folder.messages} messages, sample read)`}`
                ).join('. ')+'.');
              }catch(error){setTestResult(error instanceof Error?error.message:'Could not connect to or read the mailbox.');}
              finally{setTesting(false);}
            }}>{testing?'Testing…':'Test Mailbox'}</button>
          {testResult && <p role="status">{testResult}</p>}
        </div>
      )}
      {provider === 'smtp' && onTestEmail && (
        <div className="smtp-test-email">
          <Field label="Test recipient" hint="Uses the saved SMTP settings. Testing does not change whether SMTP is enabled.">
            <input type="email" value={recipient} autoComplete="email" maxLength={254}
              disabled={busy || testing}
              onChange={event=>{setRecipient(event.target.value);setTestResult('');}} />
          </Field>
          {dirty && <p className="muted">Save your changes before sending a test email.</p>}
          <button type="button" className="button smtp-test-send" disabled={busy || testing || dirty || !recipient.trim()}
            onClick={async()=>{
              setTestResult('');
              if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){setTestResult('Enter a valid test email recipient.');return;}
              setTesting(true);
              try {await onTestEmail(recipient);setTestResult('Test email accepted by the mail server.');}
              catch(error){setTestResult(error instanceof Error?error.message:'Could not confirm the test email. Check the recipient before retrying.');}
              finally{setTesting(false);}
            }}>{testing?'Sending…':'Test Email'}</button>
          {testResult && <p role="status">{testResult}</p>}
        </div>
      )}
    </form>
  );
}
