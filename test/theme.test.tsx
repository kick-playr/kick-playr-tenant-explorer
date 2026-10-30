import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitcher } from '../src/components/theme-switcher.tsx';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

test('switches all three themes and persists the selected theme', () => {
  render(<ThemeSwitcher />);
  assert.ok(screen.getByRole('group', { name: 'Color theme' }));
  for (const theme of ['black', 'white', 'default']) {
    const button = screen.getByRole('button', {
      name: `${theme[0]!.toUpperCase() + theme.slice(1)} theme`,
    });
    fireEvent.click(button);
    assert.equal(document.documentElement.dataset.theme, theme);
    assert.equal(
      window.localStorage.getItem('kick-playr-explorer-theme'),
      theme,
    );
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  }
});

test('restores a valid preference and ignores unsupported saved values', () => {
  window.localStorage.setItem('kick-playr-explorer-theme', 'black');
  const view = render(<ThemeSwitcher />);
  assert.equal(
    screen
      .getByRole('button', { name: 'Black theme' })
      .getAttribute('aria-pressed'),
    'true',
  );
  view.unmount();
  window.localStorage.setItem('kick-playr-explorer-theme', 'unsupported');
  render(<ThemeSwitcher />);
  assert.equal(
    screen
      .getByRole('button', { name: 'Default theme' })
      .getAttribute('aria-pressed'),
    'true',
  );
});
