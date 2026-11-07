import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, cleanup } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { BrandLogo, ThemeLogo } from '../src/components/theme-logo.tsx';
import { themeDefinitions, themeCss } from '../src/lib/theme.ts';
afterEach(cleanup);
test('logos use copied local PNGs and contrast variants are selected by theme metadata', async () => {
  render(<ThemeLogo />);
  const logo = screen.getByRole('img', { name: 'Kick Playr' });
  const images = Array.from(logo.querySelectorAll('img'));
  assert.equal(images.length, 2);
  for (const [index, variant] of ['black', 'white'].entries()) {
    const file = `/brand/kick-playr-logo-${variant}.png`;
    assert.ok(
      images[index]!.getAttribute('src')!.includes(encodeURIComponent(file)),
    );
    const bytes = await readFile(new URL(`../public${file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  for (const theme of themeDefinitions) {
    const css = themeCss
      .split('\n')
      .find((rule) => rule.includes(`[data-theme="${theme.id}"]`))!;
    assert.ok(
      css.includes(
        `--logo-on-light-display:${theme.logo === 'black' ? 'block' : 'none'}`,
      ),
    );
    assert.ok(
      css.includes(
        `--logo-on-dark-display:${theme.logo === 'white' ? 'block' : 'none'}`,
      ),
    );
    assert.equal(theme.logo, theme.colorScheme === 'dark' ? 'white' : 'black');
  }
});

test('website branding keeps the icon and kick-playr wordmark as separate elements', () => {
  const view = render(<BrandLogo />);
  assert.equal(
    view.container.querySelector('.brand-wordmark')?.textContent,
    'kick-playr.',
  );
  assert.ok(view.container.querySelector('.brand-lockup .theme-logo'));
  assert.equal(
    view.container.querySelector('.brand-wordmark b')?.textContent,
    '.',
  );
  assert.equal(
    view.container.querySelector('.brand-tagline')?.textContent,
    'Platform console',
  );
});
