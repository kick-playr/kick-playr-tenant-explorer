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

test('every registered theme has first-paint support and readable semantic color pairs', async () => {
  const { themeDefinitions, themeCss, themeInitScript, validTheme } =
    await import('../src/lib/theme.ts');
  const { runInNewContext } = await import('node:vm');
  const luminance = (hex: string) => {
    const values = [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  };
  for (const theme of themeDefinitions) {
    assert.equal(validTheme(theme.id), true);
    let favicon = '';
    const document = {
      documentElement: { dataset: {} as Record<string, string> },
      getElementById: () => ({
        setAttribute: (_key: string, value: string) => {
          favicon = value;
        },
      }),
    };
    runInNewContext(themeInitScript, {
      document,
      localStorage: { getItem: () => theme.id },
    });
    assert.equal(document.documentElement.dataset.theme, theme.id);
    assert.equal(favicon, `/brand/kick-playr-logo-${theme.logo}.png`);
    assert.ok(themeCss.includes(`:root[data-theme="${theme.id}"]`));
    for (const [foreground, background] of [
      ['text', 'background'],
      ['muted', 'surface'],
      ['onAccent', 'accent'],
      ['brandAccent', 'surface'],
      ['successText', 'successSurface'],
      ['dangerText', 'dangerSurface'],
      ['warningText', 'warningSurface'],
    ] as const) {
      const a = luminance(theme.palette[foreground]),
        b = luminance(theme.palette[background]);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${theme.id}: ${foreground}/${background} contrast`,
      );
    }
  }
});

test('favicon follows the selected theme using the local contrast variant', async () => {
  const { faviconId, themeFavicon, themeDefinitions } =
    await import('../src/lib/theme.ts');
  const icon = document.createElement('link');
  icon.id = faviconId;
  icon.rel = 'icon';
  document.head.append(icon);
  try {
    render(<ThemeSwitcher />);
    for (const theme of themeDefinitions) {
      fireEvent.click(screen.getByRole('button', { name: theme.label }));
      assert.equal(icon.getAttribute('href'), themeFavicon(theme.id));
      assert.equal(
        icon.getAttribute('href'),
        `/brand/kick-playr-logo-${theme.logo}.png`,
      );
    }
  } finally {
    icon.remove();
  }
});

test('initialization owns one favicon link independently of React hydration', async () => {
  const { themeInitScript, faviconId } = await import('../src/lib/theme.ts');
  const { runInNewContext } = await import('node:vm');
  try {
    runInNewContext(themeInitScript, {
      document,
      localStorage: { getItem: () => 'black' },
    });
    assert.equal(document.querySelectorAll(`link#${faviconId}`).length, 1);
    assert.equal(
      document.getElementById(faviconId)?.getAttribute('href'),
      '/brand/kick-playr-logo-white.png',
    );
    runInNewContext(themeInitScript, {
      document,
      localStorage: { getItem: () => 'white' },
    });
    assert.equal(document.querySelectorAll(`link#${faviconId}`).length, 1);
    assert.equal(
      document.getElementById(faviconId)?.getAttribute('href'),
      '/brand/kick-playr-logo-black.png',
    );
  } finally {
    document.getElementById(faviconId)?.remove();
  }
});
