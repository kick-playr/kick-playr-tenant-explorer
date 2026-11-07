import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import {
  emailLinkAllowed,
  HtmlEmailEditor,
} from '../src/components/html-email-editor.tsx';
afterEach(cleanup);
test('loads HTML without changing it and supports source editing and external reset', async () => {
  const original =
    '<p style="color:red">Hello <strong>{{firstName}}</strong></p>';
  const changes: string[] = [];
  const props = {
    label: 'Welcome HTML',
    value: original,
    variables: ['firstName'],
    onChange: (html: string) => changes.push(html),
  };
  const view = render(<HtmlEmailEditor {...props} />);
  await screen.findByRole('textbox', { name: 'Welcome HTML' });
  assert.deepEqual(changes, []);
  fireEvent.click(screen.getByRole('button', { name: 'HTML source' }));
  const source = screen.getByLabelText(
    'HTML source code',
  ) as HTMLTextAreaElement;
  assert.equal(source.value, original);
  fireEvent.change(source, {
    target: { value: '<p>Updated {{firstName}}</p>' },
  });
  assert.deepEqual(changes, ['<p>Updated {{firstName}}</p>']);
  view.rerender(<HtmlEmailEditor {...props} value="<p>Reset</p>" />);
  assert.equal(
    (screen.getByLabelText('HTML source code') as HTMLTextAreaElement).value,
    '<p>Reset</p>',
  );
});
test('a disabled editor cannot edit through contenteditable, toolbar, or HTML source', async () => {
  render(
    <HtmlEmailEditor
      label="Welcome HTML"
      value="<p>Hello</p>"
      variables={[]}
      disabled
      onChange={() => assert.fail('disabled edit')}
    />,
  );
  const content = await screen.findByRole('textbox', { name: 'Welcome HTML' });
  await waitFor(() =>
    assert.equal(content.getAttribute('contenteditable'), 'false'),
  );
  assert.equal(
    screen.getByRole('button', { name: 'Bold' }).matches(':disabled'),
    true,
  );
});

test('visual formatting, placeholder insertion and undo emit HTML, retaining template links', async () => {
  const changes: string[] = [];
  render(
    <HtmlEmailEditor
      label="Welcome HTML"
      value='<p><a href="{{shopMapsLink}}">Shop</a></p>'
      variables={['firstName']}
      onChange={(html) => changes.push(html)}
    />,
  );
  const box = await screen.findByRole('textbox', { name: 'Welcome HTML' });
  assert.equal(
    box.querySelector('a')?.getAttribute('href'),
    '{{shopMapsLink}}',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.change(screen.getByLabelText('Insert placeholder'), {
    target: { value: 'firstName' },
  });
  await waitFor(() => assert.ok(changes.at(-1)?.includes('<strong>')));
  assert.ok(changes.at(-1)?.includes('{{firstName}}'));
  assert.ok(changes.at(-1)?.includes('href="{{shopMapsLink}}"'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => assert.ok(!changes.at(-1)?.includes('{{firstName}}')));
});
test('editor links reject executable schemes and accept supported template links', () => {
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,bad',
    'https://user:password@example.com',
    '{{unknown}}',
  ])
    assert.equal(emailLinkAllowed(href), false);
  for (const href of [
    'https://example.com',
    'mailto:club@example.com',
    'tel:+41440000000',
    '{{shopMapsLink}}',
  ])
    assert.equal(emailLinkAllowed(href), true);
});

test('external reset discards visual undo history rather than restoring abandoned drafts', async () => {
  const changes: string[] = [];
  const props = {
    label: 'Welcome HTML',
    value: '<p>Original</p>',
    variables: ['firstName'],
    onChange: (html: string) => changes.push(html),
  };
  const view = render(<HtmlEmailEditor {...props} />);
  await screen.findByRole('textbox', { name: 'Welcome HTML' });
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.change(screen.getByLabelText('Insert placeholder'), {
    target: { value: 'firstName' },
  });
  await waitFor(() => assert.ok(changes.at(-1)?.includes('{{firstName}}')));
  view.rerender(<HtmlEmailEditor {...props} value="<p>Reset</p>" />);
  await waitFor(() =>
    assert.equal(
      screen.getByRole('textbox', { name: 'Welcome HTML' }).textContent,
      'Reset',
    ),
  );
  await waitFor(() =>
    assert.equal(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled,
      true,
    ),
  );
  assert.equal(
    screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    'false',
  );
});
