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
import { ClubSettingsEditor } from '../src/components/club-settings-editor.tsx';
import { ClubBrandingProvider } from '../src/components/club-branding-provider.tsx';
import { ThemeSwitcher } from '../src/components/theme-switcher.tsx';
import { BrandLogo } from '../src/components/theme-logo.tsx';
import {
  defaultCustomTheme,
  validateBranding,
  prepareBrandAsset,
} from '../src/lib/club-branding.ts';
import { brandingAssetResponse } from '../src/lib/branding-asset-response.ts';
import { faviconId, themeKey } from '../src/lib/theme.ts';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.getElementById(faviconId)?.remove();
});
test('branding is edited in Appearance and saved through revision-checked settings only', async () => {
  let saved: unknown;
  render(
    <ClubSettingsEditor
      settings={{ hash: 'before' }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (body) => {
        saved = body;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Club brand name'), {
    target: { value: 'Example Club' },
  });
  fireEvent.click(screen.getByLabelText('Enable a custom club theme'));
  assert.equal(screen.queryByRole('button', { name: 'Custom theme' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await waitFor(() =>
    assert.deepEqual(saved, {
      expectedHash: 'before',
      patch: {
        branding: { name: 'Example Club', customTheme: defaultCustomTheme() },
      },
    }),
  );
});
test('low contrast prevents saving and reveals Appearance without losing edits', () => {
  let saves = 0;
  render(
    <ClubSettingsEditor
      settings={{ hash: 'before' }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async () => {
        saves++;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByLabelText('Enable a custom club theme'));
  fireEvent.change(screen.getByLabelText('text hex color'), {
    target: { value: '#ffffff' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Seasons & membership' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  assert.equal(saves, 0);
  assert.equal(
    screen
      .getByRole('button', { name: 'Appearance' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.match(screen.getByRole('alert').textContent!, /contrast ratio/);
});
test('custom theme, logo and favicon are scoped to the current club and clear on switching', async () => {
  const icon = document.createElement('link');
  icon.id = faviconId;
  document.head.append(icon);
  const branding = {
    name: 'Example Club',
    logoLight: { dataUrl: png, fileName: 'logo.png' },
    faviconLight: { dataUrl: png, fileName: 'favicon.png' },
    customTheme: defaultCustomTheme(),
  };
  window.localStorage.setItem(themeKey, 'custom');
  const view = render(
    <ClubBrandingProvider
      key="one"
      scope="clubs/development/one"
      clubName="One"
      branding={branding}
    >
      <BrandLogo />
      <ThemeSwitcher />
    </ClubBrandingProvider>,
  );
  await waitFor(() =>
    assert.equal(document.documentElement.dataset.theme, 'custom'),
  );
  assert.equal(
    view.container.querySelector('.brand-wordmark')?.textContent,
    'Example Club',
  );
  assert.equal(
    view.container.querySelector('.theme-logo-on-light')?.getAttribute('src'),
    png,
  );
  assert.match(
    icon.getAttribute('href')!,
    /^\/api\/club-branding\/development\/one\/faviconLight\?v=/,
  );
  assert.ok(
    view.container
      .querySelector('style')
      ?.textContent?.includes(':root[data-theme="custom"]'),
  );
  view.rerender(
    <ClubBrandingProvider
      key="two"
      scope="clubs/development/two"
      clubName="Two"
      branding={null}
    >
      <BrandLogo />
      <ThemeSwitcher />
    </ClubBrandingProvider>,
  );
  await waitFor(() =>
    assert.equal(document.documentElement.dataset.theme, 'default'),
  );
  assert.equal(screen.queryByRole('button', { name: 'Custom theme' }), null);
  assert.equal(
    view.container.querySelector('.brand-wordmark')?.textContent,
    'kick-playr.',
  );
  assert.equal(view.container.querySelector('style'), null);
  assert.equal(icon.getAttribute('href'), '/brand/kick-playr-logo-black.png');
});
test('unsafe/oversized uploads and colors are rejected and saved raster assets use private responses', async () => {
  assert.throws(() =>
    validateBranding({
      logoLight: {
        fileName: 'bad.svg',
        dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
      },
    }),
  );
  assert.throws(() =>
    validateBranding({
      customTheme: {
        ...defaultCustomTheme(),
        colors: {
          ...defaultCustomTheme().colors,
          accent: 'url(https://bad.invalid)',
        },
      },
    }),
  );
  await assert.rejects(
    prepareBrandAsset(
      { size: 3 * 1024 * 1024, type: 'image/png' } as File,
      'logo',
    ),
    /2 MB/,
  );
  const response = brandingAssetResponse({ dataUrl: png });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.match(response.headers.get('cache-control')!, /private/);
  assert.equal(
    brandingAssetResponse({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })
      .status,
    404,
  );
});

test('logo removal is drafted and unsupported uploads leave the saved asset intact', async () => {
  let body: unknown;
  render(
    <ClubSettingsEditor
      settings={{
        hash: 'before',
        branding: {
          name: 'Example Club',
          logoLight: { dataUrl: png, fileName: 'logo.png' },
        },
      }}
      busy={false}
      onDirtyChange={() => {}}
      onSave={async (b) => {
        body = b;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  const bad = new window.File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' });
  fireEvent.change(screen.getByLabelText('Light logo'), {
    target: { files: [bad] },
  });
  await screen.findByRole('alert');
  assert.equal(
    screen.getByAltText('Light logo preview').getAttribute('src'),
    png,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove light logo' }));
  assert.equal(screen.queryByAltText('Light logo preview'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Save club settings' }));
  await waitFor(() =>
    assert.deepEqual(body, {
      expectedHash: 'before',
      patch: { branding: { name: 'Example Club', logoLight: null } },
    }),
  );
});

test('detailed logos are resized further to fit and favicons use PNG for browser compatibility', async () => {
  const originalReader = Object.getOwnPropertyDescriptor(
      globalThis,
      'FileReader',
    ),
    originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const createElement = document.createElement.bind(document);
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toDataURL(type: string) {
      return (
        `data:${type};base64,` + 'A'.repeat(this.width > 128 ? 12000 : 4000)
      );
    },
  };
  class Reader {
    result = 'data:image/png;base64,AA==';
    onload: (() => void) | null = null;
    readAsDataURL() {
      queueMicrotask(() => this.onload?.());
    }
  }
  class Picture {
    width = 1280;
    height = 1280;
    onload: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  Object.defineProperty(globalThis, 'FileReader', {
    value: Reader,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'Image', {
    value: Picture,
    configurable: true,
  });
  document.createElement = ((name: string, options?: ElementCreationOptions) =>
    name === 'canvas'
      ? canvas
      : createElement(name, options)) as typeof document.createElement;
  try {
    const file = { size: 1000, type: 'image/png', name: 'logo.png' } as File;
    const logo = await prepareBrandAsset(file, 'logo');
    assert.equal(logo.fileName, 'logo.webp');
    assert.ok(canvas.width <= 128);
    assert.ok(logo.dataUrl.length < 11000);
    const favicon = await prepareBrandAsset(file, 'favicon');
    assert.equal(favicon.fileName, 'favicon.png');
    assert.ok(favicon.dataUrl.startsWith('data:image/png;'));
    assert.ok(canvas.width <= 64);
  } finally {
    document.createElement = createElement;
    if (originalReader)
      Object.defineProperty(globalThis, 'FileReader', originalReader);
    else Reflect.deleteProperty(globalThis, 'FileReader');
    if (originalImage)
      Object.defineProperty(globalThis, 'Image', originalImage);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
});
